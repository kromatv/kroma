//! Background TMDB enrichment: resolve poster / backdrop / overview / IDs for
//! every movie and show after a scan and write them into the DB, on a small
//! pool of threads so a large library never blocks startup or `/api/scan`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tracing::{info, warn};

use crate::services::activity::{self, Shared as Activity};
use crate::db::{self, Pool};
use crate::point::Point;
use crate::infra::events::{Bus, ServerEvent};
use crate::infra::image;
use crate::infra::metadata::{self, Cache, Target};
use crate::infra::theme;
use crate::model::{Kind, MediaItem, Metadata, Show};
use crate::services::search::SearchEngine;
use crate::state::SharedState;

// TMDB allows ~50 rps; SQLite write contention also grows with writers.
const WORKERS: usize = 8;

struct Job {
    id: String,
    target: Target,
    title: String,
    year: Option<u32>,
    is_show: bool,
    // Set means "already enriched": skip the rate-limited title re-lookup.
    resolved_tmdb: Option<u64>,
    // Set means "fetch THIS id" (operator correction or acquisition import);
    // checked before `resolved_tmdb` and always performs the detail fetch.
    pin: Option<u64>,
}

#[derive(Clone)]
struct Engine {
    pool: Pool,
    cache: Arc<Cache>,
    api_key: String,
    language: String,
    data_dir: PathBuf,
    theme_songs: bool,
    bus: Bus,
    embedder: Point,
}

#[derive(Default)]
struct Counters {
    processed: AtomicUsize,
    resolved: AtomicUsize,
    missed: AtomicUsize,
    failed: AtomicUsize,
    finished: AtomicUsize,
}

// Counts a worker done on every exit path, including an unwinding panic in
// `process_job`: `run_tracked` polls for `finished == worker_count`, so a bare
// `fetch_add` after the loop would hang the (uncancellable) job forever.
struct FinishGuard<'a>(&'a Counters);
impl Drop for FinishGuard<'_> {
    fn drop(&mut self) {
        self.0.finished.fetch_add(1, Ordering::Relaxed);
    }
}

pub struct EnrichSummary {
    pub total: usize,
    pub resolved: usize,
    pub missed: usize,
    pub failed: usize,
    pub cancelled: bool,
}

fn build_jobs(items: &[MediaItem], shows: &[Show], pins: &Pins) -> Vec<Job> {
    let mut jobs: Vec<Job> = Vec::new();
    for i in items {
        if !matches!(i.kind, Kind::Movie | Kind::Video) {
            continue;
        }
        let on_file = i.metadata.as_ref().map(|m| m.tmdb_id).filter(|&id| id != 0);
        let pin = pins.items.get(&i.id).copied();
        // A pin that disagrees with the id on file is a correction that has not
        // landed yet, so it re-enters the queue even though the movie looks done.
        if on_file.is_some() && (pin.is_none() || pin == on_file) {
            continue;
        }
        jobs.push(Job {
            id: i.id.clone(),
            target: Target::Movie,
            title: i.title.clone(),
            year: i.year,
            is_show: false,
            resolved_tmdb: None,
            pin,
        });
    }
    for s in shows {
        // Enqueued even when already enriched: a show may have gained a season,
        // and `enrich_episodes` fills only the new stills/cast.
        let on_file = s.metadata.as_ref().map(|m| m.tmdb_id).filter(|&id| id != 0);
        let pin = pins.shows.get(&s.id).copied();
        jobs.push(Job {
            id: s.id.clone(),
            target: Target::Tv,
            title: s.title.clone(),
            year: s.year,
            is_show: true,
            resolved_tmdb: on_file.filter(|_| pin.is_none() || pin == on_file),
            pin: pin.filter(|&p| Some(p) != on_file),
        });
    }
    jobs
}

#[derive(Default)]
struct Pins {
    items: std::collections::HashMap<String, u64>,
    shows: std::collections::HashMap<String, u64>,
}

fn pin_for(state: &SharedState, kind: &str, id: &str) -> Option<u64> {
    let conn = state.db.get().ok()?;
    if let Some(p) = db::tmdb_pin::get(&conn, kind, id).ok().flatten() {
        return Some(p);
    }
    if kind == db::metadata_core::SHOW {
        db::acq_tmdb_for_show(&conn, id).ok().flatten()
    } else {
        db::acq_tmdb_for_item(&conn, id).ok().flatten()
    }
}

fn load_pins(pool: &Pool) -> Pins {
    // Acquisition hints first, then operator corrections: the operator wins.
    let mut items = db::acq_tmdb_by_item(pool).unwrap_or_default();
    let mut shows = db::acq_tmdb_by_show(pool).unwrap_or_default();
    items.extend(db::tmdb_pin::all_for_kind(pool, db::metadata_core::ITEM).unwrap_or_default());
    shows.extend(db::tmdb_pin::all_for_kind(pool, db::metadata_core::SHOW).unwrap_or_default());
    Pins { items, shows }
}

fn engine_for(state: &SharedState, api_key: String) -> Engine {
    Engine {
        pool: state.db.clone(),
        cache: state.metadata_cache.clone(),
        api_key,
        language: crate::services::settings::metadata_language(&state.settings, &state.config),
        data_dir: state.config.data_dir.clone(),
        theme_songs: crate::services::settings::theme_songs_enabled(&state.settings),
        bus: state.events.clone(),
        embedder: state.embedder.clone(),
    }
}

/// Returns immediately; work proceeds on detached threads.
pub fn maybe_spawn(state: &SharedState, items: &[MediaItem], shows: &[Show]) {
    let Some(api_key) = state.config.tmdb_api_key.clone() else {
        return;
    };
    if !state.config.tmdb_enrich {
        return;
    }
    let jobs = build_jobs(items, shows, &load_pins(&state.db));
    if jobs.is_empty() {
        return;
    }
    let total = jobs.len();
    info!(titles = total, "starting background TMDB enrichment");
    activity::enrich_started(&state.activity, total);
    spawn(engine_for(state, api_key), state.activity.clone(), state.search.clone(), jobs);
}

fn blank_metadata() -> Metadata {
    Metadata {
        provider: "tmdb",
        tmdb_id: 0,
        imdb_id: None,
        title: None,
        tagline: None,
        overview: None,
        release_date: None,
        genres: Vec::new(),
        rating: None,
        poster_url: None,
        backdrop_url: None,
        logo_url: None,
        theme_url: None,
        cast: Vec::new(),
        crew: Vec::new(),
        keywords: Vec::new(),
        tvdb_id: None,
        tmdb_url: String::new(),
    }
}

// The per-episode still travels in `backdrop_url`, where `backdropFor` finds it.
fn episode_metadata(art: &metadata::EpisodeArt) -> Metadata {
    Metadata {
        title: art.name.clone(),
        overview: art.overview.clone(),
        release_date: art.air_date.clone(),
        rating: art.rating,
        backdrop_url: art.still_url.clone(),
        ..blank_metadata()
    }
}

#[allow(clippy::too_many_arguments)]
fn enrich_episodes(
    pool: &Pool,
    api_key: &str,
    language: &str,
    langs: &[&str],
    data_dir: &Path,
    bus: &Bus,
    show_id: &str,
    tv_id: u64,
) {
    let Ok(Some(detail)) = db::get_show(pool, show_id) else { return };
    let have_cast = db::seasons_with_cast(pool, show_id).unwrap_or_default();
    for season in &detail.seasons {
        let missing: Vec<&MediaItem> = season
            .episodes
            .iter()
            .filter(|e| e.metadata.as_ref().and_then(|m| m.backdrop_url.as_ref()).is_none())
            .collect();
        let needs_cast = !have_cast.contains(&season.number);
        if missing.is_empty() && !needs_cast {
            continue;
        }
        let per_lang = metadata::season_episodes_multi(api_key, langs, tv_id, season.number);
        if per_lang.is_empty() {
            continue;
        }
        let primary_key = primary_lang(&per_lang, language);
        let data = &per_lang[&primary_key];

        store_episode_stills(pool, data_dir, bus, &missing, data);
        store_episode_translations(pool, &per_lang, &season.episodes);
        store_season_cast(pool, data_dir, show_id, season.number, needs_cast, &per_lang, data);
    }
}

fn store_episode_stills(
    pool: &Pool,
    data_dir: &Path,
    bus: &Bus,
    missing: &[&MediaItem],
    data: &metadata::SeasonData,
) {
    if missing.is_empty() || data.episodes.is_empty() {
        return;
    }
    let by_num: std::collections::HashMap<u32, &metadata::EpisodeArt> =
        data.episodes.iter().map(|a| (a.episode, a)).collect();
    for ep in missing {
        let Some(num) = ep.episode else { continue };
        let Some(art) = by_num.get(&num) else { continue };
        if art.still_url.is_none() && art.overview.is_none() {
            continue;
        }
        let meta = image::localize(data_dir, episode_metadata(art));
        match db::set_item_metadata(pool, &ep.id, &meta) {
            Ok(()) => bus.publish(ServerEvent::ItemUpdated { id: ep.id.clone() }),
            Err(e) => warn!(id = %ep.id, error = %e, "failed to store episode metadata"),
        }
    }
}

fn store_episode_translations(
    pool: &Pool,
    per_lang: &std::collections::HashMap<String, metadata::SeasonData>,
    episodes: &[MediaItem],
) {
    use db::translations::{self, TransData};
    for (lang, sdata) in per_lang {
        let by_num: std::collections::HashMap<u32, &metadata::EpisodeArt> =
            sdata.episodes.iter().map(|a| (a.episode, a)).collect();
        for ep in episodes {
            let Some(num) = ep.episode else { continue };
            let Some(art) = by_num.get(&num) else { continue };
            let td = TransData { title: art.name.clone(), overview: art.overview.clone(), ..Default::default() };
            if !td.is_empty() {
                let _ = translations::put(pool, "episode", &ep.id, lang, translations::TMDB, &td);
            }
        }
    }
}

// Per-language character names are aligned by index to the stored cast, which
// works because TMDB keeps cast order across languages.
#[allow(clippy::too_many_arguments)]
fn store_season_cast(
    pool: &Pool,
    data_dir: &Path,
    show_id: &str,
    season_number: u32,
    needs_cast: bool,
    per_lang: &std::collections::HashMap<String, metadata::SeasonData>,
    data: &metadata::SeasonData,
) {
    use db::translations::{self, TransData};
    if !needs_cast || data.cast.is_empty() {
        return;
    }
    let carrier =
        image::localize(data_dir, Metadata { cast: data.cast.clone(), ..blank_metadata() });
    if let Err(e) = db::set_season_cast(pool, show_id, season_number, &carrier.cast) {
        warn!(show = %show_id, season = season_number, error = %e, "failed to store season cast");
    }
    let sc_id = format!("{show_id}:{season_number}");
    for (lang, sdata) in per_lang {
        if sdata.cast.is_empty() {
            continue;
        }
        let characters: Vec<Option<String>> =
            sdata.cast.iter().map(|c| c.character.clone()).collect();
        let td = TransData { characters, ..Default::default() };
        let _ = translations::put(pool, "season_cast", &sc_id, lang, translations::TMDB, &td);
    }
}

fn process_job(eng: &Engine, counters: &Counters, total: usize, activity: Option<&Activity>, job: Job) {
    let langs: Vec<&str> = crate::i18n::SUPPORTED_LOCALES.to_vec();
    if let Some(tmdb_id) = job.resolved_tmdb {
        if job.is_show {
            enrich_episodes(
                &eng.pool, &eng.api_key, &eng.language, &langs, &eng.data_dir, &eng.bus, &job.id,
                tmdb_id,
            );
        }
        counters.resolved.fetch_add(1, Ordering::Relaxed);
        bump(eng, counters, total, activity);
        return;
    }
    let resolved = match job.pin {
        Some(tmdb_id) => {
            metadata::lookup_all_by_id(&eng.cache, &eng.api_key, &langs, job.target, tmdb_id)
        }
        None => metadata::lookup_all(
            &eng.cache, &eng.api_key, &eng.language, &langs, job.target, &job.title, job.year,
        ),
    };
    let Some(resolved) = resolved else {
        counters.missed.fetch_add(1, Ordering::Relaxed);
        bump(eng, counters, total, activity);
        return;
    };
    let primary_key = primary_lang(&resolved.by_lang, &eng.language);
    let Some(meta) = resolved.by_lang.get(&primary_key).cloned() else {
        counters.missed.fetch_add(1, Ordering::Relaxed);
        bump(eng, counters, total, activity);
        return;
    };
    // Art is language-invariant: localized once on the primary, shared by every
    // language row.
    let meta = image::localize(&eng.data_dir, meta);
    // Disabled leaves `theme_url` None, so a re-scan also clears any theme
    // cached while the feature was on.
    let meta = if eng.theme_songs { theme::localize(&eng.data_dir, meta) } else { meta };
    let doc = kroma_domain::build_doc(&job.title, job.year, &meta);
    let vector = crate::services::embeddings::embed(&eng.embedder, &doc);
    let write = if job.is_show {
        db::set_show_metadata(&eng.pool, &job.id, &meta)
    } else {
        db::set_item_metadata(&eng.pool, &job.id, &meta)
    };
    match write {
        Ok(()) => on_write_ok(eng, counters, &job, &meta, &vector, &resolved.by_lang, &langs),
        Err(e) => {
            counters.failed.fetch_add(1, Ordering::Relaxed);
            warn!(id = %job.id, error = %e, "failed to store metadata");
        }
    }
    bump(eng, counters, total, activity);
}

// Every secondary write here is best-effort: a failure must not drop the
// blob/art already stored.
#[allow(clippy::too_many_arguments)]
fn on_write_ok(
    eng: &Engine,
    counters: &Counters,
    job: &Job,
    meta: &Metadata,
    vector: &[f32],
    by_lang: &std::collections::HashMap<String, Metadata>,
    langs: &[&str],
) {
    rename_if_pinned(eng, job, meta);
    let kind = if job.is_show { db::metadata_core::SHOW } else { db::metadata_core::ITEM };
    if let Err(e) = db::store_localized(&eng.pool, kind, &job.id, meta, by_lang) {
        warn!(id = %job.id, error = %e, "failed to store localized metadata cache");
    }
    if let Err(e) = db::set_item_vector(&eng.pool, &job.id, vector) {
        warn!(id = %job.id, error = %e, "failed to store embedding");
    }
    if job.is_show && meta.tmdb_id != 0 {
        enrich_episodes(
            &eng.pool, &eng.api_key, &eng.language, langs, &eng.data_dir, &eng.bus,
            &job.id, meta.tmdb_id,
        );
    }
    counters.resolved.fetch_add(1, Ordering::Relaxed);
    eng.bus.publish(if job.is_show {
        ServerEvent::ShowUpdated { id: job.id.clone() }
    } else {
        ServerEvent::ItemUpdated { id: job.id.clone() }
    });
}

// Only a pinned (trusted) match renames the row; a plain auto-search match
// keeps its parsed title, which is the safer label for a low-confidence guess.
fn rename_if_pinned(eng: &Engine, job: &Job, meta: &Metadata) {
    if job.pin.is_none() {
        return;
    }
    let Some(title) =
        meta.title.as_deref().map(str::trim).filter(|t| !t.is_empty() && *t != job.title)
    else {
        return;
    };
    let renamed = if job.is_show {
        db::set_show_title(&eng.pool, &job.id, title)
    } else {
        db::set_item_title(&eng.pool, &job.id, title)
    };
    if let Err(e) = renamed {
        warn!(id = %job.id, error = %e, "failed to rename catalog title after a pinned match");
    }
}

fn primary_lang<T>(map: &std::collections::HashMap<String, T>, household: &str) -> String {
    let base = household.split(['-', '_']).next().unwrap_or("en");
    if map.contains_key(base) {
        base.to_string()
    } else if map.contains_key("en") {
        "en".to_string()
    } else {
        map.keys().next().cloned().unwrap_or_default()
    }
}

fn bump(eng: &Engine, counters: &Counters, total: usize, activity: Option<&Activity>) {
    let done = counters.processed.fetch_add(1, Ordering::Relaxed) + 1;
    if let Some(activity) = activity {
        activity::enrich_progress(activity, done);
        if done.is_multiple_of(25) {
            eng.bus.publish(ServerEvent::EnrichProgress { done, total });
        }
    }
}

fn spawn(eng: Engine, activity: Activity, search: Arc<SearchEngine>, jobs: Vec<Job>) {
    let total = jobs.len();
    let queue = Arc::new(Mutex::new(jobs));
    let counters = Arc::new(Counters::default());
    thread::spawn(move || {
        let worker_count = WORKERS.min(total.max(1));
        let mut handles = Vec::with_capacity(worker_count);
        for _ in 0..worker_count {
            let (eng, queue, counters, activity) =
                (eng.clone(), queue.clone(), counters.clone(), activity.clone());
            handles.push(thread::spawn(move || loop {
                let job = match queue.lock().unwrap().pop() {
                    Some(j) => j,
                    None => break,
                };
                process_job(&eng, &counters, total, Some(&activity), job);
            }));
        }
        for h in handles {
            let _ = h.join();
        }
        let resolved = counters.resolved.load(Ordering::Relaxed);
        activity::enrich_completed(&activity);
        info!(resolved, total, "TMDB enrichment complete");
        eng.bus.publish(ServerEvent::EnrichCompleted { resolved, total });
        match search.reindex_from_db(&eng.pool) {
            Ok(()) => info!("search index rebuilt after enrichment"),
            Err(e) => warn!(error = %e, "search reindex after enrichment failed"),
        }
    });
}

/// Idempotent. A TMDB *miss* returns `Ok` so the ledger records it done and does
/// not retry it every run; `Err` means a real write failure.
pub fn enrich_one(state: &SharedState, id: &str, is_show: bool) -> anyhow::Result<()> {
    let Some(api_key) = state.config.tmdb_api_key.clone() else {
        return Ok(());
    };
    let job = if is_show {
        let Some(show) = db::get_show(&state.db, id)?.map(|d| d.show) else {
            return Ok(());
        };
        let on_file = show.metadata.as_ref().map(|m| m.tmdb_id).filter(|&i| i != 0);
        let pin = pin_for(state, db::metadata_core::SHOW, id).filter(|&p| Some(p) != on_file);
        Job {
            id: show.id.clone(),
            target: Target::Tv,
            title: show.title.clone(),
            year: show.year,
            is_show: true,
            resolved_tmdb: on_file.filter(|_| pin.is_none()),
            pin,
        }
    } else {
        let Some(item) = db::get_item(&state.db, id)? else {
            return Ok(());
        };
        let on_file = item.metadata.as_ref().map(|m| m.tmdb_id).filter(|&i| i != 0);
        let pin = pin_for(state, db::metadata_core::ITEM, id).filter(|&p| Some(p) != on_file);
        Job {
            id: item.id.clone(),
            target: Target::Movie,
            title: item.title.clone(),
            year: item.year,
            is_show: false,
            resolved_tmdb: on_file.filter(|_| pin.is_none()),
            pin,
        }
    };
    let eng = engine_for(state, api_key);
    let counters = Counters::default();
    process_job(&eng, &counters, 1, None, job);
    if counters.failed.load(Ordering::Relaxed) > 0 {
        anyhow::bail!("failed to store metadata for {id}");
    }
    Ok(())
}

fn enrich_worker(
    eng: &Engine,
    queue: &Mutex<Vec<Job>>,
    counters: &Counters,
    cancel: &AtomicBool,
    total: usize,
) {
    let _done = FinishGuard(counters);
    loop {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let job = match queue.lock().unwrap().pop() {
            Some(j) => j,
            None => break,
        };
        process_job(eng, counters, total, None, job);
    }
}

/// Blocks the caller, reporting through `progress` and stopping early when
/// `cancelled()` returns true. Ignores the `tmdb_enrich` toggle: it is an
/// explicit admin action.
pub fn run_tracked(
    state: &SharedState,
    items: &[MediaItem],
    shows: &[Show],
    progress: impl Fn(usize, usize),
    cancelled: impl Fn() -> bool,
) -> EnrichSummary {
    let jobs = build_jobs(items, shows, &load_pins(&state.db));
    let total = jobs.len();
    let Some(api_key) = state.config.tmdb_api_key.clone() else {
        return EnrichSummary { total, resolved: 0, missed: 0, failed: 0, cancelled: false };
    };
    if total == 0 {
        return EnrichSummary { total, resolved: 0, missed: 0, failed: 0, cancelled: false };
    }
    let eng = engine_for(state, api_key);
    let queue = Arc::new(Mutex::new(jobs));
    let counters = Arc::new(Counters::default());
    let cancel = Arc::new(AtomicBool::new(false));
    let worker_count = WORKERS.min(total.max(1));
    let mut handles = Vec::with_capacity(worker_count);
    for _ in 0..worker_count {
        let (eng, queue, counters, cancel) =
            (eng.clone(), queue.clone(), counters.clone(), cancel.clone());
        handles.push(thread::spawn(move || {
            enrich_worker(&eng, &queue, &counters, &cancel, total)
        }));
    }
    loop {
        thread::sleep(std::time::Duration::from_millis(250));
        progress(counters.processed.load(Ordering::Relaxed), total);
        if cancelled() {
            cancel.store(true, Ordering::Relaxed);
        }
        if counters.finished.load(Ordering::Relaxed) >= worker_count {
            break;
        }
    }
    for h in handles {
        let _ = h.join();
    }
    progress(counters.processed.load(Ordering::Relaxed), total);
    EnrichSummary {
        total,
        resolved: counters.resolved.load(Ordering::Relaxed),
        missed: counters.missed.load(Ordering::Relaxed),
        failed: counters.failed.load(Ordering::Relaxed),
        cancelled: cancel.load(Ordering::Relaxed),
    }
}
