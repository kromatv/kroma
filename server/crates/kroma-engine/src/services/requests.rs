//! Request lifecycle: create, approve, deny, and the availability matcher.
//! Synchronous and does network/DB work: call it from a blocking context, never
//! inline in an async handler.

use anyhow::{anyhow, bail, Result};

use serde_json::json;

use kroma_module_host::{Event, HostStorage};

use crate::db;
use crate::infra::metadata::discover;
use crate::model::{
    ActionKind, ActionSpec, ActionStyle, Audience, CreateRequestBody, EpisodeRef, MediaRequest,
    NotificationEvent, NotificationSpec, Permission, PushCategory, RequestKind, RequestStatus, User,
};
use crate::services::jobs::now_ms;

fn tmdb_key<S: HostStorage>(state: &S) -> Result<String> {
    state.tmdb_api_key().ok_or_else(|| anyhow!("TMDB is not configured"))
}

fn language<S: HostStorage>(state: &S) -> String {
    state.metadata_language()
}

fn publish<S: HostStorage>(state: &S, req_id: &str, status: RequestStatus) {
    // Clients depend on the wire shape `{ "type": "request.updated", id, status }`;
    // HostCtx::publish merges the topic under the `type` key.
    state.publish(Event::new(
        "request.updated",
        json!({ "id": req_id, "status": status.as_str() }),
    ));
}

// Only call on a real state change: [`publish`] fires on every touch, but a
// notification must mark a transition.
fn notify_requester<S: HostStorage>(state: &S, req: &MediaRequest, status: RequestStatus, link: &str) {
    let Some(user_id) = req.requested_by.as_deref() else {
        return;
    };
    let (event, key) = match status {
        RequestStatus::Approved => (NotificationEvent::RequestApproved, "approved"),
        RequestStatus::Denied => (NotificationEvent::RequestDenied, "denied"),
        RequestStatus::Available | RequestStatus::PartiallyAvailable => {
            (NotificationEvent::RequestAvailable, "available")
        }
        RequestStatus::Pending
        | RequestStatus::Searching
        | RequestStatus::Downloading
        | RequestStatus::Importing
        | RequestStatus::Failed => return,
    };
    let available = matches!(status, RequestStatus::Available | RequestStatus::PartiallyAvailable);
    let mut spec = NotificationSpec::new(
        event,
        &format!("notifications.request.{key}.title"),
        &format!("notifications.request.{key}.body"),
    )
    .param("title", req.title.clone())
    .image(req.poster_url.clone())
    .link(link);
    if let Some(note) = req.note.as_deref().filter(|_| status == RequestStatus::Denied) {
        spec = spec.param("note", note);
    }
    if available {
        spec = spec.push_category(PushCategory::MediaAvailable).action(ActionSpec {
            id: "watch".into(),
            label_key: "notifications.action.watch".into(),
            kind: ActionKind::Link,
            href: link.to_string(),
            method: None,
            style: ActionStyle::Primary,
        });
    }
    state.notify(&Audience::user(user_id), &spec);
}

fn notify_moderators<S: HostStorage>(state: &S, req: &MediaRequest, requester: &User) {
    let spec = NotificationSpec::new(
        NotificationEvent::RequestSubmitted,
        "notifications.request.submitted.title",
        "notifications.request.submitted.body",
    )
    .param("title", req.title.clone())
    .param("user", requester.username.clone())
    .image(req.poster_url.clone())
    .link("/admin/requests")
    .push_category(PushCategory::RequestReview)
    .action(ActionSpec {
        id: "approve".into(),
        label_key: "notifications.action.approve".into(),
        kind: ActionKind::Api,
        href: format!("/api/requests/{}/approve", req.id),
        method: Some("POST".into()),
        style: ActionStyle::Primary,
    })
    .action(ActionSpec {
        id: "deny".into(),
        label_key: "notifications.action.deny".into(),
        kind: ActionKind::Api,
        href: format!("/api/requests/{}/deny", req.id),
        method: Some("POST".into()),
        style: ActionStyle::Danger,
    });
    state.notify(&Audience::permission(Permission::RequestsManage), &spec);
}

fn request_link<S: HostStorage>(state: &S, req: &MediaRequest) -> String {
    let local = state.db().get().ok().and_then(|conn| match req.kind {
        RequestKind::Movie => {
            db::movie_item_by_tmdb(&conn, req.tmdb_id).ok().flatten().map(|id| format!("/movie/{id}"))
        }
        RequestKind::Show => {
            db::show_by_tmdb(&conn, req.tmdb_id).ok().flatten().map(|id| format!("/show/{id}"))
        }
    });
    local.unwrap_or_else(|| "/requests".to_string())
}

fn notify_transition<S: HostStorage>(state: &S, id: &str, status: RequestStatus) {
    let Ok(conn) = state.db().get() else { return };
    let Ok(Some(req)) = db::get_request(&conn, id) else { return };
    drop(conn);
    let link = request_link(state, &req);
    notify_requester(state, &req, status, &link);
}

/// Create (or duplicate-merge) a request. Auto-approves when the requester
/// holds `requests.auto`.
pub fn create_request<S: HostStorage>(state: &S, user: &User, body: &CreateRequestBody) -> Result<MediaRequest> {
    let key = tmdb_key(state)?;
    let lang = language(state);
    let detail = discover::detail(&key, &lang, body.kind, body.tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))?;

    let asked_seasons: Option<Vec<u32>> = match body.kind {
        RequestKind::Movie => None,
        RequestKind::Show => body.seasons.clone().filter(|s| !s.is_empty()).map(|mut s| {
            s.sort_unstable();
            s.dedup();
            s
        }),
    };
    let asked_episodes: Option<Vec<EpisodeRef>> = match body.kind {
        RequestKind::Movie => None,
        RequestKind::Show => normalize_episodes(body.episodes.clone()),
    };

    let conn = state.db().get()?;
    if let Some(existing) = db::find_open_request(&conn, body.kind, body.tmdb_id)? {
        drop(conn);
        if body.kind == RequestKind::Show {
            merge_show_request(state, &existing, asked_seasons, asked_episodes)?;
        }
        let conn = state.db().get()?;
        return db::get_request(&conn, &existing.id)?
            .ok_or_else(|| anyhow!("request vanished during merge"));
    }
    drop(conn);

    let id = crate::services::scan::short_hash(&format!(
        "request|{}|{}|{}",
        body.kind.as_str(),
        body.tmdb_id,
        crate::services::auth::random_token()
    ));
    let new = db::NewRequest {
        id: id.clone(),
        kind: body.kind,
        tmdb_id: body.tmdb_id,
        title: detail.title.clone(),
        year: detail.year,
        poster_url: detail.poster_url.clone(),
        seasons: asked_seasons,
        episodes: asked_episodes,
        status: RequestStatus::Pending,
        requested_by: Some(user.id.clone()),
    };
    db::insert_request(state.db(), &new, now_ms())?;
    publish(state, &id, RequestStatus::Pending);

    if user.can(Permission::RequestsAuto) {
        approve_request(state, &id, Some(&user.id))?;
    } else {
        let matched = match_one(state, &id)?;
        // A request the matcher just satisfied needs no review.
        if matched.is_none() || matched == Some(RequestStatus::Pending) {
            let conn = state.db().get()?;
            let pending = db::get_request(&conn, &id)?;
            drop(conn);
            if let Some(pending) = pending {
                notify_moderators(state, &pending, user);
            }
        }
    }

    let conn = state.db().get()?;
    db::get_request(&conn, &id)?.ok_or_else(|| anyhow!("request vanished after insert"))
}

fn merge_show_request<S: HostStorage>(
    state: &S,
    existing: &MediaRequest,
    asked_seasons: Option<Vec<u32>>,
    asked_episodes: Option<Vec<EpisodeRef>>,
) -> Result<()> {
    let (merged_seasons, merged_episodes) = merge_target(
        existing.seasons.clone(),
        existing.episodes.clone(),
        asked_seasons,
        asked_episodes,
    );
    let seasons_changed = merged_seasons != existing.seasons;
    let episodes_changed = merged_episodes != existing.episodes;
    if seasons_changed {
        db::set_request_seasons(state.db(), &existing.id, merged_seasons.as_deref(), now_ms())?;
    }
    if episodes_changed {
        db::set_request_episodes(state.db(), &existing.id, merged_episodes.as_deref(), now_ms())?;
    }
    if seasons_changed || episodes_changed {
        if matches!(existing.status, RequestStatus::Approved | RequestStatus::PartiallyAvailable) {
            materialize_wanted(state, &existing.id)?;
        }
        publish(state, &existing.id, existing.status);
    }
    Ok(())
}

pub fn approve_request<S: HostStorage>(state: &S, id: &str, reviewer: Option<&str>) -> Result<MediaRequest> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request not found"))?;
    drop(conn);
    if matches!(req.status, RequestStatus::Denied) {
        bail!("request was denied; delete it and ask again");
    }
    db::set_request_status(state.db(), id, RequestStatus::Approved, reviewer, None, now_ms())?;
    materialize_wanted(state, id)?;
    let status = match_one(state, id)?.unwrap_or(RequestStatus::Approved);
    publish(state, id, status);
    notify_transition(state, id, status);
    // A no-op until the downloads milestone registers this job key.
    state.trigger_job("acquisition.search", "request-approved");
    let conn = state.db().get()?;
    db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request vanished after approve"))
}

/// Set exactly what a show request covers: the whole show (`None`/`None`), some
/// seasons, some episodes, or a mix. Unlike the merge a second ask performs,
/// this can NARROW as well as widen -- it is the admin saying what is wanted,
/// not another viewer adding to it.
///
/// The ledger is reconciled rather than rebuilt, so an episode that stays in
/// scope keeps whatever state it had: rebuilding it would forget that a download
/// is queued or that the file is already on disk. What comes out of it is what
/// the automatic search pass works from, so this is also how an admin says what
/// the job should be hunting.
pub fn set_coverage<S: HostStorage>(
    state: &S,
    id: &str,
    seasons: Option<Vec<u32>>,
    episodes: Option<Vec<EpisodeRef>>,
) -> Result<MediaRequest> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request not found"))?;
    drop(conn);
    if req.kind != RequestKind::Show {
        bail!("a movie request covers one film; there is nothing to scope");
    }
    if matches!(req.status, RequestStatus::Denied) {
        bail!("request was denied; delete it and ask again");
    }
    let seasons = seasons.filter(|s| !s.is_empty()).map(|mut s| {
        s.sort_unstable();
        s.dedup();
        s
    });
    let episodes = normalize_episodes(episodes);
    db::set_request_seasons(state.db(), id, seasons.as_deref(), now_ms())?;
    db::set_request_episodes(state.db(), id, episodes.as_deref(), now_ms())?;

    // A pending request has no ledger yet; approving it builds one from the
    // coverage just set, so there is nothing to reconcile until then.
    let status = if matches!(req.status, RequestStatus::Pending) {
        req.status
    } else {
        reconcile_wanted(state, id)?;
        match_one(state, id)?.unwrap_or(req.status)
    };
    publish(state, id, status);
    state.trigger_job("acquisition.search", "request-coverage");
    let conn = state.db().get()?;
    db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request vanished after coverage change"))
}

/// Bring the ledger in line with what the request now covers, KEEPING the state
/// of every row that survives. `insert_wanted` ignores rows already there and
/// `prune_wanted` drops the ones that fell out of scope; between them nothing
/// that was grabbed or is on disk is forgotten.
fn reconcile_wanted<S: HostStorage>(state: &S, id: &str) -> Result<()> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request not found"))?;
    drop(conn);
    let rows = build_wanted_rows(state, &req)?;
    let keep: Vec<String> = rows.iter().map(|r| r.id.clone()).collect();
    db::insert_wanted(state.db(), &rows, now_ms())?;
    db::prune_wanted(state.db(), id, &keep)?;
    Ok(())
}

pub fn deny_request<S: HostStorage>(state: &S, id: &str, reviewer: &str, note: Option<&str>) -> Result<MediaRequest> {
    let changed =
        db::set_request_status(state.db(), id, RequestStatus::Denied, Some(reviewer), note, now_ms())?;
    if !changed {
        bail!("request not found");
    }
    publish(state, id, RequestStatus::Denied);
    notify_transition(state, id, RequestStatus::Denied);
    let conn = state.db().get()?;
    db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request vanished after deny"))
}

fn normalize_episodes(episodes: Option<Vec<EpisodeRef>>) -> Option<Vec<EpisodeRef>> {
    let mut list = episodes.filter(|e| !e.is_empty())?;
    list.sort_unstable_by_key(|e| (e.season, e.episode));
    list.dedup();
    Some(list)
}

fn is_whole_show(seasons: &Option<Vec<u32>>, episodes: &Option<Vec<EpisodeRef>>) -> bool {
    seasons.is_none() && episodes.is_none()
}

// Union of two Show targets. A whole-show side absorbs everything; otherwise a
// `None` set means the EMPTY set, not "all", so a narrow ask never shrinks a
// broader request.
fn merge_target(
    ex_seasons: Option<Vec<u32>>,
    ex_episodes: Option<Vec<EpisodeRef>>,
    add_seasons: Option<Vec<u32>>,
    add_episodes: Option<Vec<EpisodeRef>>,
) -> (Option<Vec<u32>>, Option<Vec<EpisodeRef>>) {
    if is_whole_show(&ex_seasons, &ex_episodes) || is_whole_show(&add_seasons, &add_episodes) {
        return (None, None);
    }
    let mut seasons: Vec<u32> =
        ex_seasons.unwrap_or_default().into_iter().chain(add_seasons.unwrap_or_default()).collect();
    let seasons = if seasons.is_empty() {
        None
    } else {
        seasons.sort_unstable();
        seasons.dedup();
        Some(seasons)
    };
    let episodes: Vec<EpisodeRef> = ex_episodes
        .unwrap_or_default()
        .into_iter()
        .chain(add_episodes.unwrap_or_default())
        .collect();
    (seasons, normalize_episodes(Some(episodes)))
}

fn materialize_wanted<S: HostStorage>(state: &S, id: &str) -> Result<()> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request not found"))?;
    drop(conn);
    let rows = build_wanted_rows(state, &req)?;
    db::replace_wanted(state.db(), &req.id, &rows, now_ms())
}

/// The wanted rows a request WOULD get on approval, persisting nothing.
pub fn preview_wanted<S: HostStorage>(state: &S, req: &MediaRequest, out: &mut Vec<db::WantedRow>) -> Result<()> {
    *out = build_wanted_rows(state, req)?;
    Ok(())
}

fn build_wanted_rows<S: HostStorage>(state: &S, req: &MediaRequest) -> Result<Vec<db::WantedRow>> {
    let key = tmdb_key(state)?;
    let lang = language(state);
    let detail = discover::detail(&key, &lang, req.kind, req.tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))?;
    build_wanted_rows_from(state, req, &detail)
}

fn build_wanted_rows_from<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    detail: &discover::DiscoverRawDetail,
) -> Result<Vec<db::WantedRow>> {
    let key = tmdb_key(state)?;
    let lang = language(state);

    let mut rows: Vec<db::WantedRow> = Vec::new();
    let mint = |salt: &str| {
        crate::services::scan::short_hash(&format!("wanted|{}|{}|{salt}", req.id, req.tmdb_id))
    };
    match req.kind {
        RequestKind::Movie => rows.push(db::WantedRow {
            id: mint("movie"),
            request_id: req.id.clone(),
            kind: "movie".into(),
            tmdb_id: req.tmdb_id,
            imdb_id: detail.imdb_id.clone(),
            title: req.title.clone(),
            year: req.year,
            season: None,
            episode: None,
            // The soonest availability date (digital > theatrical > release) gates an
            // unreleased movie out of search (wanted_searchable: air_date NULL or <= today).
            air_date: detail.available_date.clone(),
            status: "wanted".into(),
            last_search_at: None,
        }),
        RequestKind::Show => {
            use std::collections::{BTreeSet, HashSet};
            let full_seasons: HashSet<u32> = match (&req.seasons, &req.episodes) {
                (Some(list), _) => list.iter().copied().collect(),
                (None, None) => detail.seasons.iter().map(|s| s.season).collect(),
                (None, Some(_)) => HashSet::new(),
            };
            let individual: HashSet<(u32, u32)> = req
                .episodes
                .as_ref()
                .map(|eps| eps.iter().map(|e| (e.season, e.episode)).collect())
                .unwrap_or_default();
            let needed: BTreeSet<u32> =
                full_seasons.iter().copied().chain(individual.iter().map(|(s, _)| *s)).collect();
            for season in needed {
                let want_whole = full_seasons.contains(&season);
                let data = crate::infra::metadata::season_episodes(&key, &lang, req.tmdb_id, season);
                for ep in data.episodes {
                    if !want_whole && !individual.contains(&(season, ep.episode)) {
                        continue;
                    }
                    rows.push(db::WantedRow {
                        id: mint(&format!("s{season:02}e{:03}", ep.episode)),
                        request_id: req.id.clone(),
                        kind: "episode".into(),
                        tmdb_id: req.tmdb_id,
                        imdb_id: detail.imdb_id.clone(),
                        title: req.title.clone(),
                        year: req.year,
                        season: Some(season),
                        episode: Some(ep.episode),
                        air_date: ep.air_date.clone(),
                        status: "wanted".into(),
                        last_search_at: None,
                    });
                }
            }
            if rows.is_empty() {
                bail!("TMDB lists no episodes for the requested seasons");
            }
        }
    }
    Ok(rows)
}

#[derive(Debug, Default)]
pub struct MatchSummary {
    pub checked: usize,
    pub changed: usize,
}

/// Re-derive availability for every non-terminal request.
pub fn availability_pass<S: HostStorage>(state: &S) -> Result<MatchSummary> {
    let conn = state.db().get()?;
    let all = db::list_requests(&conn, None)?;
    drop(conn);
    let mut summary = MatchSummary::default();
    for req in all {
        if matches!(req.status, RequestStatus::Denied | RequestStatus::Failed) {
            continue;
        }
        summary.checked += 1;
        if let Some(new_status) = match_one(state, &req.id)? {
            if new_status != req.status {
                summary.changed += 1;
                publish(state, &req.id, new_status);
            }
        }
    }
    Ok(summary)
}

const REFRESH_MIN_INTERVAL_MS: i64 = 3 * 60 * 60 * 1000;

fn is_ended(air_status: Option<&str>) -> bool {
    matches!(air_status, Some("Ended") | Some("Canceled"))
}

fn needs_refresh(req: &MediaRequest, now: i64) -> bool {
    if matches!(req.status, RequestStatus::Denied | RequestStatus::Failed) {
        return false;
    }
    if let Some(ts) = req.last_refresh_at {
        if now - ts < REFRESH_MIN_INTERVAL_MS {
            return false;
        }
    }
    match req.kind {
        RequestKind::Movie => req.status != RequestStatus::Available,
        RequestKind::Show => !is_ended(req.air_status.as_deref()),
    }
}

/// Re-fetch every refreshable request from TMDB: additively extend its wanted
/// ledger, backfill air dates, and store the airing signals. An episode that
/// aired since the last pass is put back at the front of the search queue and
/// the search job is kicked, so a weekly show is looked for the day it airs
/// rather than whenever the cron next comes round.
pub fn refresh_pass<S: HostStorage>(state: &S) -> Result<usize> {
    let conn = state.db().get()?;
    let all = db::list_requests(&conn, None)?;
    drop(conn);
    let now = now_ms();
    let mut refreshed = 0usize;
    let mut newly_aired: Vec<String> = Vec::new();
    for req in all {
        if !needs_refresh(&req, now) {
            continue;
        }
        // A per-request failure must not abort the pass; the next cron retries.
        match refresh_one(state, &req) {
            Ok(aired) => newly_aired.extend(aired),
            Err(e) => {
                tracing::warn!(target: "requests", request = %req.id, "refresh failed: {e:#}");
                continue;
            }
        }
        refreshed += 1;
    }
    if !newly_aired.is_empty() {
        db::reset_wanted_search(state.db(), &newly_aired, now)?;
        tracing::info!(target: "requests", count = newly_aired.len(), "newly aired, searching now");
        state.trigger_job("acquisition.search", "episode-aired");
    }
    Ok(refreshed)
}

// The ids of rows this refresh found to be airable now: newly inserted rows
// already past their air date, plus rows whose date was backfilled into the
// past. Both are cases where waiting for the next cron tick loses a day.
fn refresh_one<S: HostStorage>(state: &S, req: &MediaRequest) -> Result<Vec<String>> {
    let key = tmdb_key(state)?;
    let lang = language(state);
    let detail = discover::detail(&key, &lang, req.kind, req.tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))?;

    let today = today_ymd();
    let mut newly_aired: Vec<String> = Vec::new();
    if req.kind == RequestKind::Show {
        newly_aired = refresh_wanted(state, req, &detail, &today)?;
    } else if let Some(avail) = detail.available_date.as_deref() {
        // set_wanted_air_date only writes rows whose air_date IS NULL, so a known
        // date is never overwritten.
        let conn = state.db().get()?;
        let rows = db::wanted_for_request(&conn, &req.id)?;
        drop(conn);
        for w in rows.iter().filter(|w| w.air_date.is_none()) {
            db::set_wanted_air_date(state.db(), &w.id, avail, now_ms())?;
            if avail <= today.as_str() && w.status == "wanted" {
                newly_aired.push(w.id.clone());
            }
        }
    }

    // A movie's next air date is only reported while still in the future: a past
    // date means "already out", which gets no upcoming badge.
    let next_air_date = match req.kind {
        RequestKind::Show => detail.next_air.as_ref().map(|(d, _, _)| d.clone()),
        RequestKind::Movie => detail.available_date.clone().filter(|d| d.as_str() > today.as_str()),
    };
    db::set_request_air(
        state.db(),
        &req.id,
        detail.status.as_deref(),
        next_air_date.as_deref(),
        now_ms(),
    )?;
    Ok(newly_aired)
}

// Additive only: inserts missing (season, episode) rows and backfills air dates.
// Never deletes a row and never changes a row's status. Answers with the rows
// that became searchable in the process.
fn refresh_wanted<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    detail: &discover::DiscoverRawDetail,
    today: &str,
) -> Result<Vec<String>> {
    let conn = state.db().get()?;
    let existing = db::wanted_for_request(&conn, &req.id)?;
    drop(conn);
    // Never seed a ledger, only extend one: a pending request must stay empty or
    // the search pass would grab before a moderator green-lit it.
    if existing.is_empty() {
        return Ok(Vec::new());
    }
    let desired = build_wanted_rows_from(state, req, detail)?;

    use std::collections::HashMap;
    // Key on (season, episode), not id: a row minted under an older id formula
    // must still dedup.
    let have: HashMap<(Option<u32>, Option<u32>), &db::WantedRow> =
        existing.iter().map(|w| ((w.season, w.episode), w)).collect();

    let mut to_insert: Vec<db::WantedRow> = Vec::new();
    let mut newly_aired: Vec<String> = Vec::new();
    for d in desired {
        match have.get(&(d.season, d.episode)) {
            None => {
                if d.air_date.as_deref().is_none_or(|air| air <= today) {
                    newly_aired.push(d.id.clone());
                }
                to_insert.push(d);
            }
            Some(row) => backfill_air_date(state, row, d.air_date.as_deref(), today, &mut newly_aired)?,
        }
    }
    db::insert_wanted(state.db(), &to_insert, now_ms())?;
    Ok(newly_aired)
}

// A row TMDB has since dated. Only ever fills a blank -- a date already known is
// the one the ledger was built with -- and reports the row when that date turns
// out to be in the past, since it just became searchable.
fn backfill_air_date<S: HostStorage>(
    state: &S,
    row: &db::WantedRow,
    air_date: Option<&str>,
    today: &str,
    newly_aired: &mut Vec<String>,
) -> Result<()> {
    if row.air_date.is_some() {
        return Ok(());
    }
    let Some(air) = air_date else { return Ok(()) };
    db::set_wanted_air_date(state.db(), &row.id, air, now_ms())?;
    if air <= today && row.status == "wanted" {
        newly_aired.push(row.id.clone());
    }
    Ok(())
}

/// Fulfill a request from a completed import, without waiting for the
/// scan -> enrich -> match-by-tmdbId chain (enrichment may not recover the id).
pub fn on_download_imported<S: HostStorage>(state: &S, request_id: &str) -> Result<()> {
    let conn = state.db().get()?;
    let Some(req) = db::get_request(&conn, request_id)? else {
        return Ok(());
    };
    let wanted = db::wanted_for_request(&conn, request_id)?;
    drop(conn);
    let grabbed: Vec<String> =
        wanted.iter().filter(|w| w.status == "grabbed").map(|w| w.id.clone()).collect();
    if !grabbed.is_empty() {
        db::set_wanted_status(state.db(), &grabbed, "available", now_ms())?;
    }
    let conn = state.db().get()?;
    let wanted = db::wanted_for_request(&conn, request_id)?;
    drop(conn);
    let status = if wanted.is_empty() || wanted.iter().all(|w| w.status == "available") {
        RequestStatus::Available
    } else if wanted.iter().any(|w| w.status == "available") {
        RequestStatus::PartiallyAvailable
    } else {
        return Ok(());
    };
    if req.status != status {
        db::set_request_status(state.db(), request_id, status, None, None, now_ms())?;
        publish(state, request_id, status);
        let link = request_link(state, &req);
        notify_requester(state, &req, status, &link);
    }
    Ok(())
}

/// Match one request against the local catalog. `None` when no judgement is
/// possible; never downgrades a request that already reached `available`.
pub fn match_one<S: HostStorage>(state: &S, id: &str) -> Result<Option<RequestStatus>> {
    let conn = state.db().get()?;
    let Some(req) = db::get_request(&conn, id)? else {
        return Ok(None);
    };
    match req.kind {
        RequestKind::Movie => match_movie(state, conn, &req),
        RequestKind::Show => match_show(state, conn, &req),
    }
}

fn match_movie<S: HostStorage>(
    state: &S,
    conn: db::PooledConn,
    req: &MediaRequest,
) -> Result<Option<RequestStatus>> {
    let Some(_item) = db::movie_item_by_tmdb(&conn, req.tmdb_id)? else {
        return Ok(None);
    };
    let wanted_ids: Vec<String> =
        db::wanted_for_request(&conn, &req.id)?.into_iter().map(|w| w.id).collect();
    drop(conn);
    db::set_wanted_status(state.db(), &wanted_ids, "available", now_ms())?;
    if req.status != RequestStatus::Available {
        db::set_request_status(state.db(), &req.id, RequestStatus::Available, None, None, now_ms())?;
        let link = request_link(state, req);
        notify_requester(state, req, RequestStatus::Available, &link);
    }
    Ok(Some(RequestStatus::Available))
}

fn match_show<S: HostStorage>(
    state: &S,
    conn: db::PooledConn,
    req: &MediaRequest,
) -> Result<Option<RequestStatus>> {
    let Some(show_id) = db::show_by_tmdb(&conn, req.tmdb_id)? else {
        return Ok(None);
    };
    let present: std::collections::HashSet<(u32, u32)> =
        db::episodes_present(&conn, &show_id)?.into_iter().collect();
    let wanted = db::wanted_for_request(&conn, &req.id)?;
    drop(conn);
    if wanted.is_empty() {
        return Ok(None);
    }
    let today = today_ymd();
    let (aired, have, newly_available) = tally_wanted(&wanted, &present, &today);
    db::set_wanted_status(state.db(), &newly_available, "available", now_ms())?;
    let new_status = if aired > 0 && have == aired {
        RequestStatus::Available
    } else if have > 0 {
        RequestStatus::PartiallyAvailable
    } else {
        return Ok(None);
    };
    // Never regress a fully-available request (e.g. a temporary unmount).
    if req.status == RequestStatus::Available && new_status != RequestStatus::Available {
        return Ok(Some(RequestStatus::Available));
    }
    if new_status != req.status {
        db::set_request_status(state.db(), &req.id, new_status, None, None, now_ms())?;
        let link = request_link(state, req);
        notify_requester(state, req, new_status, &link);
    }
    Ok(Some(new_status))
}

fn tally_wanted(
    wanted: &[db::WantedRow],
    present: &std::collections::HashSet<(u32, u32)>,
    today: &str,
) -> (usize, usize, Vec<String>) {
    let mut newly_available: Vec<String> = Vec::new();
    let (mut aired, mut have) = (0usize, 0usize);
    for w in wanted {
        let (Some(s), Some(e)) = (w.season, w.episode) else { continue };
        let is_aired = w.air_date.as_deref().is_none_or(|d| d <= today);
        if !is_aired {
            continue;
        }
        aired += 1;
        if present.contains(&(s, e)) {
            have += 1;
            if w.status != "available" {
                newly_available.push(w.id.clone());
            }
        }
    }
    (aired, have, newly_available)
}

/// Today as `YYYY-MM-DD` in UTC, the wanted ledger's air-date vocabulary.
pub fn today_ymd() -> String {
    let now = time::OffsetDateTime::now_utc();
    format!("{:04}-{:02}-{:02}", now.year(), u8::from(now.month()), now.day())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ep(season: u32, episode: u32) -> EpisodeRef {
        EpisodeRef { season, episode }
    }

    #[test]
    fn merge_target_whole_show_absorbs_any_ask() {
        assert_eq!(merge_target(None, None, None, Some(vec![ep(1, 3)])), (None, None));
        assert_eq!(merge_target(None, None, Some(vec![2]), None), (None, None));
        assert_eq!(merge_target(Some(vec![1]), None, None, None), (None, None));
    }

    #[test]
    fn merge_target_unions_seasons_and_episodes() {
        assert_eq!(
            merge_target(Some(vec![1]), None, Some(vec![2, 1]), None),
            (Some(vec![1, 2]), None)
        );
        assert_eq!(
            merge_target(None, Some(vec![ep(1, 3)]), None, Some(vec![ep(1, 4)])),
            (None, Some(vec![ep(1, 3), ep(1, 4)]))
        );
        assert_eq!(
            merge_target(Some(vec![2]), None, None, Some(vec![ep(1, 5)])),
            (Some(vec![2]), Some(vec![ep(1, 5)]))
        );
        assert_eq!(
            merge_target(None, Some(vec![ep(1, 3)]), None, Some(vec![ep(1, 3)])),
            (None, Some(vec![ep(1, 3)]))
        );
    }

    #[test]
    fn normalize_episodes_empty_is_none() {
        assert_eq!(normalize_episodes(Some(vec![])), None);
        assert_eq!(normalize_episodes(None), None);
        assert_eq!(
            normalize_episodes(Some(vec![ep(2, 1), ep(1, 2), ep(1, 2)])),
            Some(vec![ep(1, 2), ep(2, 1)])
        );
    }

    #[test]
    fn is_whole_show_only_when_both_unset() {
        assert!(is_whole_show(&None, &None));
        assert!(!is_whole_show(&Some(vec![1]), &None));
        assert!(!is_whole_show(&None, &Some(vec![ep(1, 1)])));
        assert!(!is_whole_show(&Some(vec![1]), &Some(vec![ep(1, 1)])));
    }

    #[test]
    fn is_ended_recognizes_terminal_states() {
        assert!(is_ended(Some("Ended")));
        assert!(is_ended(Some("Canceled")));
        assert!(!is_ended(Some("Returning Series")));
        assert!(!is_ended(Some("In Production")));
        assert!(!is_ended(None));
    }

    fn req(kind: RequestKind, status: RequestStatus) -> MediaRequest {
        MediaRequest {
            id: "r1".into(),
            kind,
            tmdb_id: 42,
            title: "Title".into(),
            year: Some(2020),
            poster_url: None,
            seasons: None,
            episodes: None,
            status,
            requested_by: None,
            requested_by_name: None,
            reviewed_by: None,
            note: None,
            created_at: 0,
            updated_at: 0,
            progress: None,
            air_status: None,
            next_air_date: None,
            last_refresh_at: None,
        }
    }

    #[test]
    fn needs_refresh_skips_terminal_and_throttles() {
        let now = 1_000_000_000_000i64;
        assert!(!needs_refresh(&req(RequestKind::Movie, RequestStatus::Denied), now));
        assert!(!needs_refresh(&req(RequestKind::Show, RequestStatus::Failed), now));
        let mut recent = req(RequestKind::Movie, RequestStatus::Approved);
        recent.last_refresh_at = Some(now - 1000);
        assert!(!needs_refresh(&recent, now));
        let mut old = req(RequestKind::Movie, RequestStatus::Approved);
        old.last_refresh_at = Some(now - REFRESH_MIN_INTERVAL_MS - 1);
        assert!(needs_refresh(&old, now));
    }

    #[test]
    fn needs_refresh_movie_and_show_rules() {
        let now = 1_000_000_000_000i64;
        assert!(!needs_refresh(&req(RequestKind::Movie, RequestStatus::Available), now));
        assert!(needs_refresh(&req(RequestKind::Movie, RequestStatus::Approved), now));
        let mut ended = req(RequestKind::Show, RequestStatus::Approved);
        ended.air_status = Some("Ended".into());
        assert!(!needs_refresh(&ended, now));
        let mut ongoing = req(RequestKind::Show, RequestStatus::Approved);
        ongoing.air_status = Some("Returning Series".into());
        assert!(needs_refresh(&ongoing, now));
        assert!(needs_refresh(&req(RequestKind::Show, RequestStatus::Approved), now));
    }

    fn wr(season: u32, episode: u32, air: Option<&str>, status: &str) -> db::WantedRow {
        db::WantedRow {
            id: format!("s{season}e{episode}"),
            request_id: "r1".into(),
            kind: "episode".into(),
            tmdb_id: 42,
            imdb_id: None,
            title: "Title".into(),
            year: Some(2020),
            season: Some(season),
            episode: Some(episode),
            air_date: air.map(str::to_string),
            status: status.into(),
            last_search_at: None,
        }
    }

    #[test]
    fn tally_wanted_counts_aired_present_and_newly_available() {
        use std::collections::HashSet;
        let today = "2026-07-18";
        let wanted = vec![
            wr(1, 1, None, "wanted"),               // aired (null date), present -> newly available
            wr(1, 2, Some("2030-01-01"), "wanted"), // future -> not aired, ignored
            wr(1, 3, Some("2020-01-01"), "available"), // aired + present, already available
            wr(1, 4, None, "wanted"),               // aired but not present
        ];
        let present: HashSet<(u32, u32)> = [(1, 1), (1, 3)].into_iter().collect();
        let (aired, have, newly) = tally_wanted(&wanted, &present, today);
        assert_eq!(aired, 3);
        assert_eq!(have, 2);
        assert_eq!(newly, vec!["s1e1".to_string()]);
    }

    #[test]
    fn tally_wanted_skips_rows_without_season_or_episode() {
        use std::collections::HashSet;
        let mut movie_row = wr(1, 1, None, "wanted");
        movie_row.season = None;
        movie_row.episode = None;
        let present: HashSet<(u32, u32)> = HashSet::new();
        let (aired, have, newly) = tally_wanted(&[movie_row], &present, "2026-07-18");
        assert_eq!((aired, have, newly.len()), (0, 0, 0));
    }

    #[test]
    fn today_ymd_is_well_formed() {
        let today = today_ymd();
        assert_eq!(today.len(), 10);
        let bytes = today.as_bytes();
        assert_eq!(bytes[4], b'-');
        assert_eq!(bytes[7], b'-');
        let parts: Vec<&str> = today.split('-').collect();
        assert_eq!(parts.len(), 3);
        let (y, m, d): (i32, u8, u8) =
            (parts[0].parse().unwrap(), parts[1].parse().unwrap(), parts[2].parse().unwrap());
        assert!(y >= 2020);
        assert!((1..=12).contains(&m));
        assert!((1..=31).contains(&d));
    }

    type TestHost = kroma_module_host::testing::StubHost;

    use kroma_domain::ParamValue;

    fn param(params: &std::collections::BTreeMap<String, ParamValue>, key: &str) -> Option<String> {
        params.get(key).map(|v| v.resolve(|k| Some(k.to_string())))
    }

    fn test_host() -> TestHost {
        host_with_tmdb(Some("test-key"))
    }

    fn host_without_tmdb() -> TestHost {
        host_with_tmdb(None)
    }

    fn host_with_tmdb(key: Option<&str>) -> TestHost {
        // `en-US`, not the stub's bare `en`: a test asserts the exact `language=`
        // sent to TMDB.
        let host = TestHost::with_db("requests")
            .with_module_enabled(false)
            .with_metadata_language("en-US");
        match key {
            Some(k) => host.with_tmdb_key(k),
            None => host,
        }
    }

    fn exec(host: &TestHost, sql: &str) {
        host.db().get().unwrap().execute(sql, []).unwrap();
    }

    fn seed_library(host: &TestHost) {
        exec(host, "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib1','L','mixed','/x','now')");
    }

    fn seed_movie_item(host: &TestHost, item_id: &str, tmdb: u64) {
        seed_library(host);
        exec(host, &format!("INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('{item_id}','movie','T','mkv','lib1','now')"));
        exec(host, &format!("INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('item','{item_id}',{tmdb},0)"));
    }

    fn seed_show(host: &TestHost, show_id: &str, tmdb: u64, present: &[(u32, u32)]) {
        seed_library(host);
        exec(host, &format!("INSERT INTO shows (id,library,title,added_at) VALUES ('{show_id}','lib1','Show','now')"));
        exec(host, &format!("INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('show','{show_id}',{tmdb},0)"));
        for (s, e) in present {
            exec(host, &format!("INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) VALUES ('{show_id}-s{s}e{e}','episode','E','mkv','lib1','{show_id}',{s},{e},'now')"));
        }
    }

    fn insert_req(host: &TestHost, id: &str, kind: RequestKind, tmdb: u64, status: RequestStatus) {
        insert_req_by(host, id, kind, tmdb, status, None);
    }

    fn seed_user(host: &TestHost, id: &str) {
        exec(host, &format!("INSERT OR IGNORE INTO users (id,email,username,password_hash,created_at) VALUES ('{id}','{id}@example.test','{id}','x','now')"));
    }

    fn insert_req_by(
        host: &TestHost,
        id: &str,
        kind: RequestKind,
        tmdb: u64,
        status: RequestStatus,
        requested_by: Option<&str>,
    ) {
        if let Some(uid) = requested_by {
            seed_user(host, uid);
        }
        db::insert_request(
            host.db(),
            &db::NewRequest {
                id: id.into(),
                kind,
                tmdb_id: tmdb,
                title: "T".into(),
                year: Some(2020),
                poster_url: None,
                seasons: None,
                episodes: None,
                status,
                requested_by: requested_by.map(str::to_string),
            },
            now_ms(),
        )
        .unwrap();
    }

    fn wanted(id: &str, req_id: &str, season: Option<u32>, episode: Option<u32>, air: Option<&str>, status: &str) -> db::WantedRow {
        db::WantedRow {
            id: id.into(),
            request_id: req_id.into(),
            kind: if season.is_some() { "episode".into() } else { "movie".into() },
            tmdb_id: 100,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season,
            episode,
            air_date: air.map(str::to_string),
            status: status.into(),
            last_search_at: None,
        }
    }

    fn status_of_req(host: &TestHost, id: &str) -> RequestStatus {
        let conn = host.db().get().unwrap();
        db::get_request(&conn, id).unwrap().unwrap().status
    }

    #[test]
    fn coverage_is_not_a_thing_a_movie_request_has() {
        let host = host_with_tmdb(Some("k"));
        insert_req(&host, "r1", RequestKind::Movie, 7, RequestStatus::Approved);
        let err = set_coverage(&host, "r1", Some(vec![1]), None).unwrap_err();
        assert!(err.to_string().contains("nothing to scope"), "{err}");
    }

    #[test]
    fn coverage_refuses_a_denied_request() {
        let host = host_with_tmdb(Some("k"));
        insert_req(&host, "r1", RequestKind::Show, 42, RequestStatus::Denied);
        assert!(set_coverage(&host, "r1", Some(vec![1]), None).unwrap_err().to_string().contains("denied"));
    }

    #[test]
    fn coverage_on_a_pending_request_only_records_the_target() {
        // Nothing to reconcile: approving is what builds the ledger, and it will
        // build it from the coverage just set.
        let host = host_with_tmdb(Some("k"));
        insert_req(&host, "r1", RequestKind::Show, 42, RequestStatus::Pending);
        let req = set_coverage(&host, "r1", Some(vec![3, 1, 1]), None).unwrap();
        assert_eq!(req.seasons, Some(vec![1, 3]), "sorted and deduped");
        assert_eq!(req.status, RequestStatus::Pending, "recording a target approves nothing");
        let conn = host.db().get().unwrap();
        assert!(db::wanted_for_request(&conn, "r1").unwrap().is_empty());
    }

    #[test]
    fn coverage_normalizes_empty_lists_to_the_whole_show() {
        let host = host_with_tmdb(Some("k"));
        insert_req(&host, "r1", RequestKind::Show, 42, RequestStatus::Pending);
        let req = set_coverage(&host, "r1", Some(vec![]), Some(vec![])).unwrap();
        assert_eq!(req.seasons, None);
        assert_eq!(req.episodes, None);
    }

    #[test]
    fn narrowing_coverage_drops_the_rows_that_left_and_keeps_the_rest_as_they_were() {
        let host = host_with_tmdb(Some("k"));
        insert_req(&host, "r1", RequestKind::Show, 42, RequestStatus::Approved);
        let mk = |id: &str, season: u32, episode: u32, status: &str| db::WantedRow {
            id: id.into(),
            request_id: "r1".into(),
            kind: "episode".into(),
            tmdb_id: 42,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season: Some(season),
            episode: Some(episode),
            air_date: Some("2020-01-01".into()),
            status: status.into(),
            last_search_at: None,
        };
        db::replace_wanted(
            host.db(),
            "r1",
            &[mk("keep", 1, 1, "available"), mk("drop", 2, 1, "wanted")],
            0,
        )
        .unwrap();

        // The ids the rebuild mints are deterministic, so a row that stays in
        // scope is recognised and keeps its state rather than being re-created.
        let rows = {
            let conn = host.db().get().unwrap();
            db::wanted_for_request(&conn, "r1").unwrap()
        };
        assert_eq!(rows.len(), 2, "both there before narrowing");

        db::prune_wanted(host.db(), "r1", &["keep".into()]).unwrap();
        let conn = host.db().get().unwrap();
        let after = db::wanted_for_request(&conn, "r1").unwrap();
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].status, "available", "the survivor did not forget its file");
    }

    #[test]
    fn match_one_movie_flips_wanted_and_request_to_available() {
        let host = test_host();
        seed_movie_item(&host, "m1", 603);
        insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Approved);
        db::replace_wanted(host.db(), "r1", &[wanted("w1", "r1", None, None, None, "wanted")], now_ms())
            .unwrap();

        let status = match_one(&host, "r1").unwrap();
        assert_eq!(status, Some(RequestStatus::Available));
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
        let conn = host.db().get().unwrap();
        assert_eq!(db::wanted_for_request(&conn, "r1").unwrap()[0].status, "available");
    }

    #[test]
    fn match_one_movie_absent_from_catalog_is_no_judgement() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 999, RequestStatus::Approved);
        assert_eq!(match_one(&host, "r1").unwrap(), None);
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Approved);
    }

    #[test]
    fn match_one_show_available_when_all_aired_episodes_present() {
        let host = test_host();
        seed_show(&host, "s1", 1396, &[(1, 1), (1, 2)]);
        insert_req(&host, "r1", RequestKind::Show, 1396, RequestStatus::Approved);
        db::replace_wanted(
            host.db(),
            "r1",
            &[
                wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "wanted"),
                wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "wanted"),
            ],
            now_ms(),
        )
        .unwrap();

        assert_eq!(match_one(&host, "r1").unwrap(), Some(RequestStatus::Available));
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
    }

    #[test]
    fn match_one_show_partial_when_some_episodes_missing() {
        let host = test_host();
        seed_show(&host, "s1", 1396, &[(1, 1)]);
        insert_req(&host, "r1", RequestKind::Show, 1396, RequestStatus::Approved);
        db::replace_wanted(
            host.db(),
            "r1",
            &[
                wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "wanted"),
                wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "wanted"),
            ],
            now_ms(),
        )
        .unwrap();

        assert_eq!(match_one(&host, "r1").unwrap(), Some(RequestStatus::PartiallyAvailable));
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::PartiallyAvailable);
    }

    #[test]
    fn match_one_show_pending_without_ledger_is_no_judgement() {
        let host = test_host();
        seed_show(&host, "s1", 1396, &[(1, 1)]);
        insert_req(&host, "r1", RequestKind::Show, 1396, RequestStatus::Pending);
        assert_eq!(match_one(&host, "r1").unwrap(), None);
    }

    #[test]
    fn on_download_imported_flips_grabbed_rows_to_available() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Approved);
        db::replace_wanted(host.db(), "r1", &[wanted("w1", "r1", None, None, None, "grabbed")], now_ms())
            .unwrap();

        on_download_imported(&host, "r1").unwrap();
        let conn = host.db().get().unwrap();
        assert_eq!(db::wanted_for_request(&conn, "r1").unwrap()[0].status, "available");
        drop(conn);
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
        assert!(host.published().len() >= 1, "an available flip publishes an update");
    }

    #[test]
    fn on_download_imported_unknown_request_is_noop() {
        let host = test_host();
        on_download_imported(&host, "ghost").unwrap();
        assert_eq!(host.published().len(), 0);
    }

    #[test]
    fn availability_pass_checks_nonterminal_and_counts_changes() {
        let host = test_host();
        seed_movie_item(&host, "m1", 603);
        insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Approved);
        db::replace_wanted(host.db(), "r1", &[wanted("w1", "r1", None, None, None, "wanted")], now_ms())
            .unwrap();
        insert_req(&host, "r2", RequestKind::Show, 1396, RequestStatus::Approved);
        insert_req(&host, "r3", RequestKind::Movie, 700, RequestStatus::Denied);

        let summary = availability_pass(&host).unwrap();
        assert_eq!(summary.checked, 2, "denied request excluded from the pass");
        assert_eq!(summary.changed, 1, "only the movie flipped");
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
    }

    #[test]
    fn build_wanted_rows_from_movie_makes_one_row_with_release_gate() {
        let host = test_host();
        let request = req(RequestKind::Movie, RequestStatus::Approved);
        let detail = raw_detail(Some("tt0133093"), Some("2020-01-01"));
        let rows = build_wanted_rows_from(&host, &request, &detail).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].kind, "movie");
        assert_eq!(rows[0].tmdb_id, request.tmdb_id);
        assert_eq!(rows[0].imdb_id.as_deref(), Some("tt0133093"));
        assert_eq!(rows[0].air_date.as_deref(), Some("2020-01-01"));
        assert_eq!(rows[0].status, "wanted");
    }

    #[test]
    fn build_wanted_rows_from_show_with_empty_seasons_bails() {
        let host = test_host();
        let mut request = req(RequestKind::Show, RequestStatus::Approved);
        request.seasons = Some(Vec::new());
        let detail = raw_detail(None, None);
        assert!(build_wanted_rows_from(&host, &request, &detail).is_err());
    }

    fn raw_detail(imdb: Option<&str>, avail: Option<&str>) -> discover::DiscoverRawDetail {
        discover::DiscoverRawDetail {
            kind: RequestKind::Movie,
            tmdb_id: 42,
            title: "T".into(),
            year: Some(2020),
            poster_url: None,
            backdrop_url: None,
            overview: None,
            tagline: None,
            genres: Vec::new(),
            rating: None,
            runtime_min: None,
            imdb_id: imdb.map(str::to_string),
            seasons: Vec::new(),
            cast: Vec::new(),
            crew: Vec::new(),
            similar: Vec::new(),
            status: None,
            next_air: None,
            available_date: avail.map(str::to_string),
        }
    }

    #[test]
    fn deny_request_marks_denied_and_publishes() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Approved);
        let denied = deny_request(&host, "r1", "mod", Some("nope")).unwrap();
        assert_eq!(denied.status, RequestStatus::Denied);
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Denied);
        assert!(host.published().len() >= 1);
    }

    #[test]
    fn deny_request_unknown_request_errors() {
        let host = test_host();
        assert!(deny_request(&host, "ghost", "mod", None).is_err());
    }

    #[test]
    fn approve_request_on_denied_bails_without_network() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Denied);
        let err = approve_request(&host, "r1", Some("mod")).unwrap_err();
        assert!(err.to_string().contains("denied"), "unexpected error: {err}");
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Denied);
    }

    #[test]
    fn approve_request_unknown_request_errors() {
        let host = test_host();
        assert!(approve_request(&host, "ghost", None).is_err());
    }

    #[test]
    fn merge_show_request_widens_pending_seasons_without_materializing() {
        let host = test_host();
        db::insert_request(
            host.db(),
            &db::NewRequest {
                id: "r1".into(),
                kind: RequestKind::Show,
                tmdb_id: 100,
                title: "T".into(),
                year: None,
                poster_url: None,
                seasons: Some(vec![1]),
                episodes: None,
                status: RequestStatus::Pending,
                requested_by: None,
            },
            now_ms(),
        )
        .unwrap();
        let conn = host.db().get().unwrap();
        let existing = db::get_request(&conn, "r1").unwrap().unwrap();
        drop(conn);

        merge_show_request(&host, &existing, Some(vec![2]), None).unwrap();

        let conn = host.db().get().unwrap();
        let updated = db::get_request(&conn, "r1").unwrap().unwrap();
        assert_eq!(updated.seasons, Some(vec![1, 2]));
        assert!(host.published().len() >= 1, "a widened request publishes an update");
    }

    #[test]
    fn merge_show_request_no_change_does_not_publish() {
        let host = test_host();
        db::insert_request(
            host.db(),
            &db::NewRequest {
                id: "r1".into(),
                kind: RequestKind::Show,
                tmdb_id: 100,
                title: "T".into(),
                year: None,
                poster_url: None,
                seasons: Some(vec![1, 2]),
                episodes: None,
                status: RequestStatus::Pending,
                requested_by: None,
            },
            now_ms(),
        )
        .unwrap();
        let conn = host.db().get().unwrap();
        let existing = db::get_request(&conn, "r1").unwrap().unwrap();
        drop(conn);

        merge_show_request(&host, &existing, Some(vec![1]), None).unwrap();
        assert_eq!(host.published().len(), 0);
    }

    #[test]
    fn refresh_wanted_noop_on_empty_ledger() {
        let host = test_host();
        let request = req(RequestKind::Show, RequestStatus::Approved);
        let detail = raw_detail(None, None);
        refresh_wanted(&host, &request, &detail, "2026-07-16").unwrap();
        let conn = host.db().get().unwrap();
        assert!(db::wanted_for_request(&conn, &request.id).unwrap().is_empty());
    }

    #[test]
    fn refresh_pass_skips_all_terminal_and_settled_requests() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 1, RequestStatus::Denied);
        insert_req(&host, "r2", RequestKind::Show, 2, RequestStatus::Failed);
        insert_req(&host, "r3", RequestKind::Movie, 3, RequestStatus::Available);
        assert_eq!(refresh_pass(&host).unwrap(), 0);
    }

    #[test]
    fn match_one_unknown_request_is_none() {
        let host = test_host();
        assert_eq!(match_one(&host, "ghost").unwrap(), None);
    }

    #[test]
    fn match_show_never_regresses_a_fully_available_request() {
        let host = test_host();
        seed_show(&host, "s1", 1396, &[(1, 1)]);
        insert_req(&host, "r1", RequestKind::Show, 1396, RequestStatus::Available);
        db::replace_wanted(
            host.db(),
            "r1",
            &[
                wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "available"),
                wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "available"),
            ],
            now_ms(),
        )
        .unwrap();
        assert_eq!(match_one(&host, "r1").unwrap(), Some(RequestStatus::Available));
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
    }

    #[test]
    fn match_show_no_verdict_when_aired_but_none_present() {
        let host = test_host();
        seed_show(&host, "s1", 1396, &[]);
        insert_req(&host, "r1", RequestKind::Show, 1396, RequestStatus::Approved);
        db::replace_wanted(
            host.db(),
            "r1",
            &[
                wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "wanted"),
                wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "wanted"),
            ],
            now_ms(),
        )
        .unwrap();
        assert_eq!(match_one(&host, "r1").unwrap(), None);
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Approved);
    }

    #[test]
    fn on_download_imported_show_partial_when_some_still_wanted() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Show, 1396, RequestStatus::Approved);
        db::replace_wanted(
            host.db(),
            "r1",
            &[
                wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "grabbed"),
                wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "wanted"),
            ],
            now_ms(),
        )
        .unwrap();
        on_download_imported(&host, "r1").unwrap();
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::PartiallyAvailable);
        let conn = host.db().get().unwrap();
        let rows = db::wanted_for_request(&conn, "r1").unwrap();
        assert_eq!(rows.iter().filter(|w| w.status == "available").count(), 1);
    }

    #[test]
    fn on_download_imported_no_grabbed_rows_is_noop() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Approved);
        db::replace_wanted(host.db(), "r1", &[wanted("w1", "r1", None, None, None, "wanted")], now_ms())
            .unwrap();
        on_download_imported(&host, "r1").unwrap();
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Approved);
        assert_eq!(host.published().len(), 0);
    }

    fn user(id: &str, permissions: Vec<Permission>) -> User {
        crate::test_support::test_user(id, permissions)
    }

    fn req_by(kind: RequestKind, status: RequestStatus, requester: &str) -> MediaRequest {
        let mut r = req(kind, status);
        r.requested_by = Some(requester.into());
        r
    }

    #[test]
    fn only_the_four_outcomes_worth_interrupting_someone_for_notify() {
        let host = test_host();
        let silent = [
            RequestStatus::Pending,
            RequestStatus::Searching,
            RequestStatus::Downloading,
            RequestStatus::Importing,
            RequestStatus::Failed,
        ];
        for status in silent {
            notify_requester(&host, &req_by(RequestKind::Movie, status, "u1"), status, "/requests");
        }
        assert!(host.notifications().is_empty(), "{silent:?} must stay quiet");

        for status in [
            RequestStatus::Approved,
            RequestStatus::Denied,
            RequestStatus::Available,
            RequestStatus::PartiallyAvailable,
        ] {
            notify_requester(&host, &req_by(RequestKind::Movie, status, "u1"), status, "/requests");
        }
        let sent = host.notifications();
        assert_eq!(sent.len(), 4);
        let events: Vec<NotificationEvent> = sent.iter().map(|(_, s)| s.event).collect();
        assert_eq!(
            events,
            [
                NotificationEvent::RequestApproved,
                NotificationEvent::RequestDenied,
                NotificationEvent::RequestAvailable,
                // Partially available still means "there is something to watch now".
                NotificationEvent::RequestAvailable,
            ]
        );
        for (audience, _) in &sent {
            assert_eq!(audience, &Audience::user("u1"));
        }
        assert_eq!(sent[0].1.title_key, "notifications.request.approved.title");
        assert_eq!(sent[1].1.body_key, "notifications.request.denied.body");
        assert_eq!(sent[2].1.title_key, "notifications.request.available.title");
    }

    #[test]
    fn a_request_filed_before_accounts_existed_has_nobody_to_tell() {
        let host = test_host();
        let orphan = req(RequestKind::Movie, RequestStatus::Approved);
        assert!(orphan.requested_by.is_none());
        notify_requester(&host, &orphan, RequestStatus::Approved, "/requests");
        assert!(host.notifications().is_empty());
    }

    #[test]
    fn a_denial_carries_the_moderators_note_and_only_a_denial_does() {
        let host = test_host();
        let mut denied = req_by(RequestKind::Movie, RequestStatus::Denied, "u1");
        denied.note = Some("we already have this in 4K".into());
        notify_requester(&host, &denied, RequestStatus::Denied, "/requests");

        let mut approved = denied.clone();
        approved.status = RequestStatus::Approved;
        notify_requester(&host, &approved, RequestStatus::Approved, "/requests");

        let sent = host.notifications();
        assert_eq!(param(&sent[0].1.params, "note").as_deref(), Some("we already have this in 4K"));
        assert_eq!(param(&sent[1].1.params, "note"), None);
        assert_eq!(param(&sent[0].1.params, "title").as_deref(), Some("Title"));
        assert_eq!(param(&sent[1].1.params, "title").as_deref(), Some("Title"));
    }

    #[test]
    fn only_a_ready_to_watch_notification_gets_a_button() {
        let host = test_host();
        let mut ready = req_by(RequestKind::Movie, RequestStatus::Available, "u1");
        ready.poster_url = Some("https://img.example/p.jpg".into());
        notify_requester(&host, &ready, RequestStatus::Available, "/movie/abc");
        notify_requester(
            &host,
            &req_by(RequestKind::Movie, RequestStatus::Approved, "u1"),
            RequestStatus::Approved,
            "/requests",
        );

        let sent = host.notifications();
        let available = &sent[0].1;
        assert_eq!(available.push_category, Some(PushCategory::MediaAvailable));
        assert_eq!(available.actions.len(), 1);
        let watch = &available.actions[0];
        assert_eq!(watch.id, "watch");
        assert_eq!(watch.kind, ActionKind::Link);
        assert_eq!(watch.href, "/movie/abc");
        assert_eq!(watch.method, None);
        assert_eq!(available.link.as_deref(), Some("/movie/abc"));
        assert_eq!(available.image_url.as_deref(), Some("https://img.example/p.jpg"));

        assert!(sent[1].1.actions.is_empty());
        assert_eq!(sent[1].1.push_category, None);
    }

    #[test]
    fn moderators_can_decide_from_the_notification_itself() {
        let host = test_host();
        let mut pending = req(RequestKind::Show, RequestStatus::Pending);
        pending.id = "req-7".into();
        notify_moderators(&host, &pending, &user("alice", vec![Permission::Playback]));

        let sent = host.notifications();
        assert_eq!(sent.len(), 1);
        let (audience, spec) = &sent[0];
        assert_eq!(audience, &Audience::permission(Permission::RequestsManage));
        assert_eq!(spec.event, NotificationEvent::RequestSubmitted);
        assert_eq!(param(&spec.params, "user").as_deref(), Some("alice"));
        assert_eq!(spec.link.as_deref(), Some("/admin/requests"));
        assert_eq!(spec.push_category, Some(PushCategory::RequestReview));

        let ids: Vec<&str> = spec.actions.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(ids, ["approve", "deny"]);
        for action in &spec.actions {
            assert_eq!(action.kind, ActionKind::Api);
            assert_eq!(action.method.as_deref(), Some("POST"));
            assert!(action.href.contains("req-7"), "{}", action.href);
        }
        assert_eq!(sent[0].1.actions[0].style, ActionStyle::Primary);
        assert_eq!(sent[0].1.actions[1].style, ActionStyle::Danger);
    }

    #[test]
    fn a_notification_links_to_the_title_once_it_is_in_the_library() {
        let host = test_host();
        let away = req(RequestKind::Movie, RequestStatus::Pending);
        assert_eq!(request_link(&host, &away), "/requests");

        seed_movie_item(&host, "item-9", 42);
        assert_eq!(request_link(&host, &away), "/movie/item-9");

        let show = req(RequestKind::Show, RequestStatus::Pending);
        assert_eq!(request_link(&host, &show), "/requests", "no show with that tmdb id yet");
        seed_show(&host, "show-9", 42, &[]);
        assert_eq!(request_link(&host, &show), "/show/show-9");
    }

    #[test]
    fn denying_a_request_tells_its_author_where_to_look() {
        let host = test_host();
        insert_req_by(&host, "r-deny", RequestKind::Movie, 42, RequestStatus::Pending, Some("u1"));
        seed_movie_item(&host, "item-42", 42);

        let before = host.published().len();
        let denied = deny_request(&host, "r-deny", "mod-1", Some("duplicate")).unwrap();
        assert_eq!(denied.status, RequestStatus::Denied);
        assert_eq!(denied.note.as_deref(), Some("duplicate"));
        assert_eq!(host.published().len(), before + 1);

        let sent = host.notifications();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].0, Audience::user("u1"));
        assert_eq!(sent[0].1.event, NotificationEvent::RequestDenied);
        assert_eq!(param(&sent[0].1.params, "note").as_deref(), Some("duplicate"));
        assert_eq!(sent[0].1.link.as_deref(), Some("/movie/item-42"));
    }

    #[test]
    fn denying_a_request_that_is_not_there_fails_instead_of_inventing_one() {
        let host = test_host();
        let err = deny_request(&host, "nope", "mod-1", None).unwrap_err().to_string();
        assert!(err.contains("not found"), "{err}");
        assert!(host.notifications().is_empty());
    }

    #[test]
    fn approving_a_denied_request_is_refused_rather_than_silently_reopened() {
        let host = test_host();
        insert_req(&host, "r-x", RequestKind::Movie, 42, RequestStatus::Denied);
        let err = approve_request(&host, "r-x", Some("mod-1")).unwrap_err().to_string();
        assert!(err.contains("denied"), "{err}");

        let err = approve_request(&host, "ghost", Some("mod-1")).unwrap_err().to_string();
        assert!(err.contains("not found"), "{err}");
    }

    #[test]
    fn creating_a_request_without_tmdb_configured_says_so() {
        let host = host_without_tmdb();
        let err = create_request(
            &host,
            &user("u1", vec![Permission::Playback]),
            &CreateRequestBody {
                kind: RequestKind::Movie,
                tmdb_id: 42,
                seasons: None,
                episodes: None,
            },
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("TMDB is not configured"), "{err}");
    }

    #[test]
    fn a_refresh_pass_survives_a_request_it_cannot_refresh() {
        // No TMDB key, so every refresh_one fails at the first step.
        let host = host_without_tmdb();
        insert_req(&host, "r1", RequestKind::Movie, 42, RequestStatus::Approved);
        insert_req(&host, "r2", RequestKind::Movie, 43, RequestStatus::Approved);
        assert_eq!(refresh_pass(&host).unwrap(), 0);

        let host2 = test_host();
        insert_req(&host2, "r3", RequestKind::Movie, 44, RequestStatus::Denied);
        assert_eq!(refresh_pass(&host2).unwrap(), 0);
    }

    fn detail(kind: RequestKind, tmdb_id: u64, available: Option<&str>) -> discover::DiscoverRawDetail {
        discover::DiscoverRawDetail {
            kind,
            tmdb_id,
            title: "T".into(),
            year: Some(2020),
            poster_url: None,
            backdrop_url: None,
            overview: None,
            tagline: None,
            genres: Vec::new(),
            rating: None,
            runtime_min: None,
            imdb_id: Some("tt0000001".into()),
            seasons: Vec::new(),
            cast: Vec::new(),
            crew: Vec::new(),
            similar: Vec::new(),
            status: None,
            next_air: None,
            available_date: available.map(str::to_string),
        }
    }

    #[test]
    fn refresh_never_creates_a_ledger_for_a_request_nobody_approved() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 42, RequestStatus::Pending);
        let req = req(RequestKind::Movie, RequestStatus::Pending);
        refresh_wanted(&host, &req, &detail(RequestKind::Movie, 42, Some("2026-01-01")), "2026-07-16").unwrap();

        let conn = host.db().get().unwrap();
        assert!(db::wanted_for_request(&conn, "r1").unwrap().is_empty());
    }

    #[test]
    fn refresh_backfills_a_missing_air_date_and_leaves_the_row_alone_otherwise() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 42, RequestStatus::Approved);
        let undated = wanted("w1", "r1", None, None, None, "grabbed");
        db::insert_wanted(host.db(), std::slice::from_ref(&undated), now_ms()).unwrap();

        let req = req(RequestKind::Movie, RequestStatus::Approved);
        refresh_wanted(&host, &req, &detail(RequestKind::Movie, 42, Some("2026-03-04")), "2026-07-16").unwrap();

        let conn = host.db().get().unwrap();
        let rows = db::wanted_for_request(&conn, "r1").unwrap();
        drop(conn);
        assert_eq!(rows.len(), 1, "the movie row is matched, not duplicated");
        assert_eq!(rows[0].air_date.as_deref(), Some("2026-03-04"));
        assert_eq!(rows[0].status, "grabbed", "an in-flight download is untouched");

        refresh_wanted(&host, &req, &detail(RequestKind::Movie, 42, Some("2030-01-01")), "2026-07-16").unwrap();
        let conn = host.db().get().unwrap();
        let rows = db::wanted_for_request(&conn, "r1").unwrap();
        assert_eq!(rows[0].air_date.as_deref(), Some("2026-03-04"));
    }
    use crate::test_support::FakeTmdb;

    fn movie_detail(title: &str, year: &str) -> serde_json::Value {
        json!({
            "title": title,
            "overview": "A film.",
            "release_date": year,
            "poster_path": "/p.jpg",
            "imdb_id": "tt0000001",
            "genres": [{ "id": 28, "name": "Action" }],
        })
    }

    fn show_detail(title: &str, seasons: &[u32]) -> serde_json::Value {
        json!({
            "name": title,
            "overview": "A show.",
            "first_air_date": "2020-01-01",
            "status": "Returning Series",
            "seasons": seasons
                .iter()
                .map(|n| json!({ "season_number": n, "name": format!("Season {n}") }))
                .collect::<Vec<_>>(),
        })
    }

    fn episodes(nums: &[u32], air: &str) -> serde_json::Value {
        json!({
            "episodes": nums
                .iter()
                .map(|n| json!({ "episode_number": n, "name": format!("E{n}"), "air_date": air }))
                .collect::<Vec<_>>(),
        })
    }

    fn body(user: &str) -> CreateRequestBody {
        let _ = user;
        CreateRequestBody { kind: RequestKind::Movie, tmdb_id: 603, seasons: None, episodes: None }
    }

    #[test]
    fn creating_a_movie_request_takes_its_title_from_tmdb() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|path| match path {
            "/movie/603" => (200, movie_detail("The Matrix", "1999-03-31")),
            _ => (404, json!({ "status_message": "Not Found" })),
        });
        seed_user(&host, "u1");

        let req = create_request(&host, &user("u1", vec![Permission::Playback]), &body("u1")).unwrap();
        assert_eq!(req.title, "The Matrix");
        assert_eq!(req.year, Some(1999));
        assert_eq!(req.status, RequestStatus::Pending);
        assert_eq!(req.requested_by.as_deref(), Some("u1"));
        let sent = host.notifications();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].0, Audience::permission(Permission::RequestsManage));
    }

    #[test]
    fn a_tmdb_id_that_does_not_resolve_is_refused_two_different_ways() {
        seed_user_and_fail(
            // curl -f turns a 404 into a transport failure, indistinguishable from
            // a dead network at this layer.
            |_| (404, json!({ "status_message": "Not Found" })),
            "TMDB lookup failed",
        );
        seed_user_and_fail(
            |_| (200, json!({ "overview": "no title field" })),
            "title not found",
        );
    }

    fn seed_user_and_fail(
        route: impl Fn(&str) -> (u16, serde_json::Value) + Send + 'static,
        expected: &str,
    ) {
        let host = test_host();
        let _tmdb = FakeTmdb::start(route);
        seed_user(&host, "u1");
        let err = create_request(&host, &user("u1", vec![Permission::Playback]), &body("u1"))
            .unwrap_err()
            .to_string();
        assert!(err.contains(expected), "wanted {expected:?}, got {err:?}");
    }

    #[test]
    fn asking_twice_folds_into_the_open_request_rather_than_duplicating() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
        seed_user(&host, "u1");
        seed_user(&host, "u2");

        let first = create_request(&host, &user("u1", vec![Permission::Playback]), &body("u1")).unwrap();
        let second = create_request(&host, &user("u2", vec![Permission::Playback]), &body("u2")).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(second.requested_by.as_deref(), Some("u1"));
    }

    #[test]
    fn a_requester_who_may_self_approve_skips_the_queue() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
        seed_user(&host, "owner");

        let req = create_request(
            &host,
            &user("owner", vec![Permission::Playback, Permission::RequestsAuto]),
            &body("owner"),
        )
        .unwrap();
        assert_eq!(req.status, RequestStatus::Approved);

        let conn = host.db().get().unwrap();
        let wanted = db::wanted_for_request(&conn, &req.id).unwrap();
        assert_eq!(wanted.len(), 1);
        assert_eq!(wanted[0].kind, "movie");
        assert_eq!(wanted[0].imdb_id.as_deref(), Some("tt0000001"));
        drop(conn);

        assert!(
            host.notifications().iter().all(|(a, _)| a != &Audience::permission(Permission::RequestsManage)),
            "a self-approved request should not page the moderators"
        );
    }

    #[test]
    fn approving_a_show_builds_one_wanted_row_per_episode_of_every_season() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|path| match path {
            "/tv/1396" => (200, show_detail("Breaking Bad", &[1, 2])),
            "/tv/1396/season/1" => (200, episodes(&[1, 2, 3], "2008-01-20")),
            "/tv/1396/season/2" => (200, episodes(&[1, 2], "2009-03-08")),
            _ => (404, json!({})),
        });
        insert_req(&host, "r-show", RequestKind::Show, 1396, RequestStatus::Pending);

        approve_request(&host, "r-show", Some("mod-1")).unwrap();

        let conn = host.db().get().unwrap();
        let wanted = db::wanted_for_request(&conn, "r-show").unwrap();
        assert_eq!(wanted.len(), 5, "3 + 2 episodes");
        assert!(wanted.iter().all(|w| w.kind == "episode"));
        let pairs: Vec<(u32, u32)> =
            wanted.iter().filter_map(|w| Some((w.season?, w.episode?))).collect();
        assert!(pairs.contains(&(1, 3)) && pairs.contains(&(2, 2)), "{pairs:?}");
    }

    #[test]
    fn a_season_subset_only_materialises_the_seasons_that_were_asked_for() {
        let host = test_host();
        let tmdb = FakeTmdb::start(|path| match path {
            "/tv/1396" => (200, show_detail("Breaking Bad", &[1, 2])),
            "/tv/1396/season/2" => (200, episodes(&[1, 2], "2009-03-08")),
            _ => (404, json!({})),
        });
        db::insert_request(
            host.db(),
            &db::NewRequest {
                id: "r-s2".into(),
                kind: RequestKind::Show,
                tmdb_id: 1396,
                title: "Breaking Bad".into(),
                year: Some(2008),
                poster_url: None,
                seasons: Some(vec![2]),
                episodes: None,
                status: RequestStatus::Pending,
                requested_by: None,
            },
            now_ms(),
        )
        .unwrap();

        approve_request(&host, "r-s2", Some("mod-1")).unwrap();

        let conn = host.db().get().unwrap();
        let wanted = db::wanted_for_request(&conn, "r-s2").unwrap();
        assert_eq!(wanted.len(), 2);
        assert!(wanted.iter().all(|w| w.season == Some(2)));
        drop(conn);

        assert!(
            !tmdb.requests().iter().any(|r| r.contains("/season/1")),
            "season 1 was fetched for a season-2 request: {:?}",
            tmdb.requests()
        );
    }

    #[test]
    fn a_show_tmdb_lists_no_episodes_for_is_refused_rather_than_approved_empty() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|path| match path {
            "/tv/1396" => (200, show_detail("Breaking Bad", &[1])),
            _ => (200, json!({ "episodes": [] })),
        });
        insert_req(&host, "r-empty", RequestKind::Show, 1396, RequestStatus::Pending);

        let err = approve_request(&host, "r-empty", Some("mod-1")).unwrap_err().to_string();
        assert!(err.contains("no episodes"), "{err}");
    }

    #[test]
    fn approving_tells_the_requester_and_kicks_the_search() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
        insert_req_by(&host, "r-1", RequestKind::Movie, 603, RequestStatus::Pending, Some("u1"));

        let approved = approve_request(&host, "r-1", Some("mod-1")).unwrap();
        assert_eq!(approved.status, RequestStatus::Approved);
        assert_eq!(approved.reviewed_by.as_deref(), Some("mod-1"));

        let sent = host.notifications();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].0, Audience::user("u1"));
        assert_eq!(sent[0].1.event, NotificationEvent::RequestApproved);
    }

    #[test]
    fn the_refresh_pass_backfills_a_release_date_tmdb_did_not_have_before() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|_| {
            let mut d = movie_detail("Dune: Part Three", "2027-03-04");
            d["release_dates"] = json!({
                "results": [{
                    "iso_3166_1": "US",
                    "release_dates": [{ "type": 4, "release_date": "2027-05-01T00:00:00.000Z" }],
                }]
            });
            (200, d)
        });
        insert_req(&host, "r-1", RequestKind::Movie, 603, RequestStatus::Approved);
        let undated = wanted("w1", "r-1", None, None, None, "wanted");
        db::insert_wanted(host.db(), std::slice::from_ref(&undated), now_ms()).unwrap();

        assert_eq!(refresh_pass(&host).unwrap(), 1);

        let conn = host.db().get().unwrap();
        let rows = db::wanted_for_request(&conn, "r-1").unwrap();
        assert!(rows[0].air_date.is_some(), "the release date was not backfilled");
    }

    fn breaking_bad() -> FakeTmdb {
        FakeTmdb::start(|path| match path {
            "/tv/1396" => (200, show_detail("Breaking Bad", &[1, 2])),
            "/tv/1396/season/1" => (200, episodes(&[1, 2, 3], "2008-01-20")),
            "/tv/1396/season/2" => (200, episodes(&[1, 2], "2009-03-08")),
            _ => (404, json!({})),
        })
    }

    fn show_body(seasons: Option<Vec<u32>>, eps: Option<Vec<EpisodeRef>>) -> CreateRequestBody {
        CreateRequestBody { kind: RequestKind::Show, tmdb_id: 1396, seasons, episodes: eps }
    }

    fn wanted_pairs(host: &TestHost, id: &str) -> Vec<(u32, u32)> {
        let conn = host.db().get().unwrap();
        let mut pairs: Vec<(u32, u32)> = db::wanted_for_request(&conn, id)
            .unwrap()
            .iter()
            .filter_map(|w| Some((w.season?, w.episode?)))
            .collect();
        pairs.sort_unstable();
        pairs
    }

    #[test]
    fn a_season_list_is_sorted_and_deduped_before_it_is_stored() {
        let host = test_host();
        let _tmdb = breaking_bad();
        seed_user(&host, "owner");

        let req = create_request(
            &host,
            &user("owner", vec![Permission::Playback]),
            &show_body(Some(vec![2, 1, 2]), None),
        )
        .unwrap();
        assert_eq!(req.seasons, Some(vec![1, 2]));
    }

    #[test]
    fn asking_for_another_season_widens_the_request_already_open_and_its_ledger() {
        let host = test_host();
        let _tmdb = breaking_bad();
        seed_user(&host, "owner");
        seed_user(&host, "u2");

        let first = create_request(
            &host,
            &user("owner", vec![Permission::Playback, Permission::RequestsAuto]),
            &show_body(Some(vec![1]), None),
        )
        .unwrap();
        assert_eq!(first.status, RequestStatus::Approved);
        assert_eq!(wanted_pairs(&host, &first.id), [(1, 1), (1, 2), (1, 3)]);

        let widened = create_request(
            &host,
            &user("u2", vec![Permission::Playback]),
            &show_body(Some(vec![2]), Some(vec![ep(1, 1)])),
        )
        .unwrap();

        assert_eq!(widened.id, first.id, "one open request, not two");
        assert_eq!(widened.seasons, Some(vec![1, 2]));
        assert_eq!(widened.episodes, Some(vec![ep(1, 1)]));
        assert_eq!(
            wanted_pairs(&host, &first.id),
            [(1, 1), (1, 2), (1, 3), (2, 1), (2, 2)],
            "an approved request rebuilds its ledger on the spot"
        );
    }

    #[test]
    fn a_request_for_single_episodes_materialises_only_those() {
        let host = test_host();
        let _tmdb = breaking_bad();
        seed_user(&host, "owner");

        let req = create_request(
            &host,
            &user("owner", vec![Permission::Playback, Permission::RequestsAuto]),
            &show_body(None, Some(vec![ep(1, 2)])),
        )
        .unwrap();

        assert!(req.seasons.is_none(), "no season was asked for, and none is implied");
        assert_eq!(wanted_pairs(&host, &req.id), [(1, 2)]);
    }

    #[test]
    fn a_preview_reports_the_rows_an_approval_would_write_without_writing_them() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
        insert_req(&host, "r-1", RequestKind::Movie, 603, RequestStatus::Pending);
        let conn = host.db().get().unwrap();
        let req = db::get_request(&conn, "r-1").unwrap().unwrap();
        drop(conn);

        let mut out = vec![wanted("stale", "r-1", None, None, None, "wanted")];
        preview_wanted(&host, &req, &mut out).unwrap();

        assert_eq!(out.len(), 1, "the caller's buffer is replaced, not appended to");
        assert_eq!(out[0].kind, "movie");
        assert_eq!(out[0].imdb_id.as_deref(), Some("tt0000001"));
        let conn = host.db().get().unwrap();
        assert!(db::wanted_for_request(&conn, "r-1").unwrap().is_empty());
    }

    #[test]
    fn the_refresh_pass_extends_a_shows_ledger_with_the_episodes_tmdb_has_since_listed() {
        let host = test_host();
        let _tmdb = breaking_bad();
        insert_req(&host, "r-show", RequestKind::Show, 1396, RequestStatus::Approved);
        db::insert_wanted(
            host.db(),
            &[wanted("w1", "r-show", Some(1), Some(1), None, "wanted")],
            now_ms(),
        )
        .unwrap();

        assert_eq!(refresh_pass(&host).unwrap(), 1);

        assert_eq!(
            wanted_pairs(&host, "r-show"),
            [(1, 1), (1, 2), (1, 3), (2, 1), (2, 2)],
            "additive: the existing row stays and the new ones join it"
        );
        let conn = host.db().get().unwrap();
        let rows = db::wanted_for_request(&conn, "r-show").unwrap();
        let first = rows.iter().find(|w| w.season == Some(1) && w.episode == Some(1)).unwrap();
        assert_eq!(first.id, "w1", "matched on (season, episode), not on the id formula");
        assert_eq!(first.air_date.as_deref(), Some("2008-01-20"), "its air date was backfilled");
    }

    #[test]
    fn a_film_tmdb_has_no_date_for_gets_its_airing_signals_and_nothing_else() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|_| {
            let mut d = movie_detail("Untitled Villeneuve Project", "");
            d["release_date"] = json!("");
            d["status"] = json!("In Production");
            (200, d)
        });
        insert_req(&host, "r-1", RequestKind::Movie, 603, RequestStatus::Approved);
        let undated = wanted("w1", "r-1", None, None, None, "wanted");
        db::insert_wanted(host.db(), std::slice::from_ref(&undated), now_ms()).unwrap();

        assert_eq!(refresh_pass(&host).unwrap(), 1);

        let conn = host.db().get().unwrap();
        assert!(db::wanted_for_request(&conn, "r-1").unwrap()[0].air_date.is_none());
        assert_eq!(
            db::get_request(&conn, "r-1").unwrap().unwrap().air_status.as_deref(),
            Some("In Production")
        );
    }

    #[test]
    fn an_episode_tmdb_still_has_no_air_date_for_keeps_its_undated_row() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|path| match path {
            "/tv/1396" => (200, show_detail("Breaking Bad", &[1])),
            _ => (200, json!({ "episodes": [{ "episode_number": 1, "name": "E1" }] })),
        });
        insert_req(&host, "r-show", RequestKind::Show, 1396, RequestStatus::Approved);
        db::insert_wanted(
            host.db(),
            &[wanted("w1", "r-show", Some(1), Some(1), None, "wanted")],
            now_ms(),
        )
        .unwrap();

        assert_eq!(refresh_pass(&host).unwrap(), 1);

        let conn = host.db().get().unwrap();
        let rows = db::wanted_for_request(&conn, "r-show").unwrap();
        assert_eq!(rows.len(), 1, "nothing new to insert");
        assert!(rows[0].air_date.is_none(), "there was no date to backfill with");
    }

    #[test]
    fn a_refresh_that_cannot_store_the_airing_signals_is_not_counted_as_refreshed() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
        insert_req(&host, "r-1", RequestKind::Movie, 603, RequestStatus::Approved);
        host.db()
            .get()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER no_request_update BEFORE UPDATE ON requests \
                 BEGIN SELECT RAISE(ABORT, 'refused'); END",
            )
            .unwrap();

        assert_eq!(refresh_pass(&host).unwrap(), 0, "the pass survives, the request does not count");
    }

    #[test]
    fn an_import_that_changes_nothing_notifies_nobody() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Available);
        db::replace_wanted(
            host.db(),
            "r1",
            &[wanted("w1", "r1", None, None, None, "available")],
            now_ms(),
        )
        .unwrap();

        on_download_imported(&host, "r1").unwrap();

        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
        assert!(host.notifications().is_empty(), "the reader was already told");
    }

    #[test]
    fn a_film_already_marked_available_is_matched_again_without_a_second_announcement() {
        let host = test_host();
        seed_movie_item(&host, "m1", 603);
        insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Available);
        db::replace_wanted(
            host.db(),
            "r1",
            &[wanted("w1", "r1", None, None, None, "wanted")],
            now_ms(),
        )
        .unwrap();

        assert_eq!(match_one(&host, "r1").unwrap(), Some(RequestStatus::Available));
        assert!(host.notifications().is_empty());
        let conn = host.db().get().unwrap();
        assert_eq!(db::wanted_for_request(&conn, "r1").unwrap()[0].status, "available");
    }

    #[test]
    fn a_show_that_is_still_exactly_as_partial_as_before_announces_nothing_new() {
        let host = test_host();
        seed_show(&host, "s1", 1396, &[(1, 1)]);
        insert_req(&host, "r1", RequestKind::Show, 1396, RequestStatus::PartiallyAvailable);
        db::replace_wanted(
            host.db(),
            "r1",
            &[
                wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "available"),
                wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "wanted"),
            ],
            now_ms(),
        )
        .unwrap();

        assert_eq!(match_one(&host, "r1").unwrap(), Some(RequestStatus::PartiallyAvailable));
        assert!(host.notifications().is_empty());
    }

    #[test]
    fn the_api_key_and_language_reach_tmdb_on_every_call() {
        let host = test_host();
        let tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
        seed_user(&host, "u1");

        create_request(&host, &user("u1", vec![Permission::Playback]), &body("u1")).unwrap();
        let asked = tmdb.requests();
        assert!(!asked.is_empty());
        assert!(asked[0].contains("api_key=test-key"), "{}", asked[0]);
        assert!(asked[0].contains("language=en-US"), "{}", asked[0]);
    }
}
