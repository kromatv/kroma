//! Request lifecycle orchestration: create (with duplicate-merge and
//! auto-approve), approve (materializes the episode-level wanted ledger from
//! TMDB season data), deny, and the availability matcher that flips requests
//! once their titles appear in the local catalog (whether imported by the
//! acquisition stack or added by hand).
//!
//! Everything here is synchronous and does network/DB work: call it from a
//! blocking context (`api::util::blocking`, a job thread), never inline in an
//! async handler.

use anyhow::{anyhow, bail, Result};

use serde_json::json;

use kroma_module_host::{Event, HostCtx};

use crate::db;
use crate::infra::metadata::discover;
use crate::model::{
    ActionKind, ActionSpec, ActionStyle, Audience, CreateRequestBody, EpisodeRef, MediaRequest,
    NotificationEvent, NotificationSpec, Permission, PushCategory, RequestKind, RequestStatus, User,
};
use crate::services::jobs::now_ms;

// Request orchestration is generic over the host state `S: HostCtx` (settings /
// TMDB config / event bus / job triggers / DB reached through the seam), so it
// runs both in-core (`S = SharedState`, the request API) and out-of-process
// (`S = RemoteHost`, the acquisition `.kmod` calling the same fulfillment logic).

fn tmdb_key<S: HostCtx>(state: &S) -> Result<String> {
    state.tmdb_api_key().ok_or_else(|| anyhow!("TMDB is not configured"))
}

fn language<S: HostCtx>(state: &S) -> String {
    state.metadata_language()
}

fn publish<S: HostCtx>(state: &S, req_id: &str, status: RequestStatus) {
    // The wire shape matches the former `ServerEvent::RequestUpdated`
    // (`{ "type": "request.updated", id, status }`): HostCtx::publish merges the
    // topic under the `type` key, so clients see identical bytes.
    state.publish(Event::new(
        "request.updated",
        json!({ "id": req_id, "status": status.as_str() }),
    ));
}

/// Tell the person who asked that their request moved.
///
/// Deliberately NOT folded into [`publish`]: that fires on every touch,
/// including a duplicate-merge that changes no status, and a notification must
/// mark a real transition. Every call site below sits behind an actual state
/// change. A request filed before accounts existed (`requested_by` NULL) has
/// nobody to tell.
fn notify_requester<S: HostCtx>(state: &S, req: &MediaRequest, status: RequestStatus, link: &str) {
    let Some(user_id) = req.requested_by.as_deref() else {
        return;
    };
    let (event, key) = match status {
        RequestStatus::Approved => (NotificationEvent::RequestApproved, "approved"),
        RequestStatus::Denied => (NotificationEvent::RequestDenied, "denied"),
        RequestStatus::Available | RequestStatus::PartiallyAvailable => {
            (NotificationEvent::RequestAvailable, "available")
        }
        // Pending is where a request starts, and searching/downloading/importing
        // are machinery the requester did not ask to watch. Only the four
        // outcomes above are worth interrupting someone for.
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
        // "Ready to watch" is the one notification worth a button: it takes you
        // straight into the title instead of the requests list.
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

/// Tell the moderators a request is waiting for them, with Approve / Deny on the
/// notification itself so a decision costs one tap and no navigation.
fn notify_moderators<S: HostCtx>(state: &S, req: &MediaRequest, requester: &User) {
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

/// Where a request's notification should take you: the title itself once it is
/// in the catalogue, else the requests list.
fn request_link<S: HostCtx>(state: &S, req: &MediaRequest) -> String {
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

/// Re-read a request and notify its author of a transition. Best effort: a
/// notification is never the point of the operation that triggered it.
fn notify_transition<S: HostCtx>(state: &S, id: &str, status: RequestStatus) {
    let Ok(conn) = state.db().get() else { return };
    let Ok(Some(req)) = db::get_request(&conn, id) else { return };
    drop(conn);
    let link = request_link(state, &req);
    notify_requester(state, &req, status, &link);
}

/// Create (or duplicate-merge) a request. Auto-approves when the requester
/// holds `requests.auto`.
pub fn create_request<S: HostCtx>(state: &S, user: &User, body: &CreateRequestBody) -> Result<MediaRequest> {
    let key = tmdb_key(state)?;
    let lang = language(state);
    let detail = discover::detail(&key, &lang, body.kind, body.tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))?;

    // Normalize the ask: None/empty = whole show; movies carry None for both.
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

    // Duplicate-merge: a second ask for an open title folds in (a show ask can
    // widen the season subset and/or the individual-episode subset;
    // re-materialized below if already approved).
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
        // The title may already sit in the library (e.g. season subset overlap):
        // let the matcher flip it right away rather than waiting for the cron.
        let matched = match_one(state, &id)?;
        // Only bother the moderators if it is genuinely waiting on them: a
        // request that the matcher just satisfied needs no review.
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

/// Duplicate-merge for a show ask that folds into an open request: widen the
/// season and/or individual-episode subset, persist any change, re-materialize
/// the wanted ledger when the request was already green-lit, and notify clients.
fn merge_show_request<S: HostCtx>(
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
            // Already green-lit: extend the wanted ledger to the new target.
            materialize_wanted(state, &existing.id)?;
        }
        publish(state, &existing.id, existing.status);
    }
    Ok(())
}

/// Approve: materialize the wanted ledger, mark approved, match availability,
/// and kick the automatic search.
pub fn approve_request<S: HostCtx>(state: &S, id: &str, reviewer: Option<&str>) -> Result<MediaRequest> {
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
    // Approving is a real transition, so the requester hears about it whether it
    // merely got green-lit or the matcher found it already on disk.
    notify_transition(state, id, status);
    // Fire the wanted-list search right away (registered with the downloads
    // milestone; until then the trigger is a no-op on the unknown key).
    state.trigger_job("acquisition.search", "request-approved");
    let conn = state.db().get()?;
    db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request vanished after approve"))
}

pub fn deny_request<S: HostCtx>(state: &S, id: &str, reviewer: &str, note: Option<&str>) -> Result<MediaRequest> {
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

/// Canonicalize an individual-episode ask: empty -> `None`, else sorted + deduped.
fn normalize_episodes(episodes: Option<Vec<EpisodeRef>>) -> Option<Vec<EpisodeRef>> {
    let mut list = episodes.filter(|e| !e.is_empty())?;
    list.sort_unstable_by_key(|e| (e.season, e.episode));
    list.dedup();
    Some(list)
}

/// A Show request targets the WHOLE show only when it names neither full seasons
/// nor individual episodes; that is the maximal target.
fn is_whole_show(seasons: &Option<Vec<u32>>, episodes: &Option<Vec<EpisodeRef>>) -> bool {
    seasons.is_none() && episodes.is_none()
}

/// Union of two Show targets (existing + a second ask), each expressed as an
/// optional full-season set plus an optional individual-episode set. A whole-show
/// side absorbs everything (stays whole show); otherwise a `None` set means the
/// EMPTY set (not "all", which only whole show denotes), so the two sets union
/// cleanly without a single-episode ask ever narrowing a broader request.
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

/// (Re)build a request's wanted rows from TMDB. Movies: one row. Shows: one
/// row per episode of every requested season, with air dates so unaired
/// episodes wait their turn. Idempotent: replaces the request's ledger.
fn materialize_wanted<S: HostCtx>(state: &S, id: &str) -> Result<()> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request not found"))?;
    drop(conn);
    let rows = build_wanted_rows(state, &req)?;
    db::replace_wanted(state.db(), &req.id, &rows, now_ms())
}

/// Fill `out` with the wanted rows a request WOULD get on approval, without
/// persisting anything (interactive search on a still-pending request).
pub fn preview_wanted<S: HostCtx>(state: &S, req: &MediaRequest, out: &mut Vec<db::WantedRow>) -> Result<()> {
    *out = build_wanted_rows(state, req)?;
    Ok(())
}

fn build_wanted_rows<S: HostCtx>(state: &S, req: &MediaRequest) -> Result<Vec<db::WantedRow>> {
    let key = tmdb_key(state)?;
    let lang = language(state);
    let detail = discover::detail(&key, &lang, req.kind, req.tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))?;
    build_wanted_rows_from(state, req, &detail)
}

/// The wanted rows a request targets, given an already-fetched TMDB detail (the
/// refresh pass fetches the detail once, for the air signals AND the ledger).
/// Still does one TMDB `season_episodes` call per requested season for the
/// per-episode air dates.
fn build_wanted_rows_from<S: HostCtx>(
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
            // The soonest availability date (digital > theatrical > release) gates
            // an unreleased movie out of search until it is out, then the search
            // pass auto-grabs it (wanted_searchable: air_date NULL or <= today).
            // A movie already out / with no TMDB date has a past / NULL date and
            // stays immediately searchable.
            air_date: detail.available_date.clone(),
            status: "wanted".into(),
            last_search_at: None,
        }),
        RequestKind::Show => {
            use std::collections::{BTreeSet, HashSet};
            // Full seasons to pull whole: the explicit `seasons` ask, or EVERY
            // season only when neither seasons nor episodes were specified.
            let full_seasons: HashSet<u32> = match (&req.seasons, &req.episodes) {
                (Some(list), _) => list.iter().copied().collect(),
                (None, None) => detail.seasons.iter().map(|s| s.season).collect(),
                (None, Some(_)) => HashSet::new(),
            };
            // Individual (season, episode) asks unioned on top of the full seasons.
            let individual: HashSet<(u32, u32)> = req
                .episodes
                .as_ref()
                .map(|eps| eps.iter().map(|e| (e.season, e.episode)).collect())
                .unwrap_or_default();
            // One TMDB call per distinct season across either source (sorted for a
            // stable order).
            let needed: BTreeSet<u32> =
                full_seasons.iter().copied().chain(individual.iter().map(|(s, _)| *s)).collect();
            for season in needed {
                let want_whole = full_seasons.contains(&season);
                let data = crate::infra::metadata::season_episodes(&key, &lang, req.tmdb_id, season);
                for ep in data.episodes {
                    // Include if the whole season is wanted OR this exact episode is;
                    // iterating distinct seasons once yields one row per episode.
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

// ----- availability matching ------------------------------------------------------

/// Outcome of one matcher pass, for job logs.
#[derive(Debug, Default)]
pub struct MatchSummary {
    pub checked: usize,
    pub changed: usize,
}

/// Re-derive availability for every non-terminal request. Runs after each
/// library scan (chained) and on a daily safety-net cron: enrichment writes
/// `metadata.tmdbId` some time after the scan itself.
pub fn availability_pass<S: HostCtx>(state: &S) -> Result<MatchSummary> {
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

// ----- TMDB refresh (keep the wanted ledger + air signals current) ---------------

/// Minimum spacing between TMDB refreshes of the same request (~3h), so the
/// 6-hourly refresh cron never re-hits TMDB for a request touched recently
/// (e.g. just approved / merged).
const REFRESH_MIN_INTERVAL_MS: i64 = 3 * 60 * 60 * 1000;

/// TMDB `status` strings for a show whose episode set is fixed forever: no new
/// episodes will air, so once refreshed we never need to fetch it again.
fn is_ended(air_status: Option<&str>) -> bool {
    matches!(air_status, Some("Ended") | Some("Canceled"))
}

/// Should this request be re-fetched from TMDB this pass? Skips terminal
/// requests, throttles by `last_refresh_at`, and skips the requests that CANNOT
/// change: a released movie already on disk, and an ended/canceled show (its
/// episode set is complete once we've recorded that status). Ongoing shows and
/// unreleased / not-yet-available movies always refresh (subject to the throttle).
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
        // A released movie already in the library will not change.
        RequestKind::Movie => req.status != RequestStatus::Available,
        // An ended/canceled show gets no new episodes; refresh it once (to record
        // the ended status + backfill air dates), then never again.
        RequestKind::Show => !is_ended(req.air_status.as_deref()),
    }
}

/// Re-fetch every refreshable request from TMDB: ADDITIVELY extend its wanted
/// ledger with newly-aired episodes, backfill air dates TMDB now knows, and
/// store the airing signals (air_status / next_air_date). Bounded by
/// [`needs_refresh`] + the throttle so TMDB is never hammered. Called by the
/// `acquisition.refresh` job.
pub fn refresh_pass<S: HostCtx>(state: &S) -> Result<usize> {
    let conn = state.db().get()?;
    let all = db::list_requests(&conn, None)?;
    drop(conn);
    let now = now_ms();
    let mut refreshed = 0usize;
    for req in all {
        if !needs_refresh(&req, now) {
            continue;
        }
        // Per-request failures (a vanished TMDB id, a transient error) must not
        // abort the whole pass; the next cron retries.
        if let Err(e) = refresh_one(state, &req) {
            tracing::warn!(target: "requests", request = %req.id, "refresh failed: {e:#}");
            continue;
        }
        refreshed += 1;
    }
    Ok(refreshed)
}

/// Refresh one request: one TMDB detail fetch, then additive ledger merge + air
/// signals. A show additively extends its episode ledger; a movie has nothing to
/// extend but backfills its wanted row's air (release) date once TMDB knows it.
fn refresh_one<S: HostCtx>(state: &S, req: &MediaRequest) -> Result<()> {
    let key = tmdb_key(state)?;
    let lang = language(state);
    let detail = discover::detail(&key, &lang, req.kind, req.tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))?;

    if req.kind == RequestKind::Show {
        refresh_wanted(state, req, &detail)?;
    } else if let Some(avail) = detail.available_date.as_deref() {
        // Movie: backfill the wanted row's air date once TMDB publishes it, so a
        // movie requested before its release date was known still gets gated out
        // of search until release, then auto-grabbed. set_wanted_air_date writes
        // only rows whose air_date IS NULL, so a known date is never overwritten
        // (and a grabbed/available row is left untouched by the search gate).
        let conn = state.db().get()?;
        let rows = db::wanted_for_request(&conn, &req.id)?;
        drop(conn);
        for w in rows.iter().filter(|w| w.air_date.is_none()) {
            db::set_wanted_air_date(state.db(), &w.id, avail, now_ms())?;
        }
    }

    // Airing signals: show = its next episode's date; movie = its soonest
    // availability, but only while still in the future (a past date is "already
    // out", so no upcoming badge).
    let today = today_ymd();
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
    Ok(())
}

/// ADDITIVELY reconcile a show's wanted ledger against TMDB: INSERT rows for
/// (season, episode) pairs not yet present (status `wanted`, with air date), and
/// backfill an air date onto an existing row that lacked one. NEVER deletes a
/// row and NEVER changes a row's status, so grabbed/available episodes are
/// untouched. This is what lets an ongoing show's newly-aired episodes finally
/// enter the ledger (and thus get searched / matched) over time.
fn refresh_wanted<S: HostCtx>(
    state: &S,
    req: &MediaRequest,
    detail: &discover::DiscoverRawDetail,
) -> Result<()> {
    let conn = state.db().get()?;
    let existing = db::wanted_for_request(&conn, &req.id)?;
    drop(conn);
    // Only EXTEND an existing ledger, never create one: a pending (not-yet-
    // approved) request has no wanted rows and must stay that way, else the
    // search pass would start grabbing before a moderator green-lit it. Approval
    // (materialize_wanted) always seeds a non-empty ledger, so an approved show
    // reaches here with rows.
    if existing.is_empty() {
        return Ok(());
    }
    let desired = build_wanted_rows_from(state, req, detail)?;

    use std::collections::HashMap;
    // Key on (season, episode) rather than id so a row created under an older id
    // formula still dedups correctly. Movie rows key on (None, None).
    let have: HashMap<(Option<u32>, Option<u32>), &db::WantedRow> =
        existing.iter().map(|w| ((w.season, w.episode), w)).collect();

    let mut to_insert: Vec<db::WantedRow> = Vec::new();
    for d in desired {
        match have.get(&(d.season, d.episode)) {
            // New (season, episode): add it as a plain wanted row.
            None => to_insert.push(d),
            // Present already: only backfill a now-known air date (the writer
            // guards on `air_date IS NULL`, so a set date is never overwritten
            // and the row's status is left alone).
            Some(existing_row) => {
                if existing_row.air_date.is_none() {
                    if let Some(air) = d.air_date.as_deref() {
                        db::set_wanted_air_date(state.db(), &existing_row.id, air, now_ms())?;
                    }
                }
            }
        }
    }
    db::insert_wanted(state.db(), &to_insert, now_ms())?;
    Ok(())
}

/// Directly fulfill a request from a completed import, WITHOUT waiting for the
/// scan -> TMDB-enrich -> match-by-tmdbId chain (which is fragile: enrichment
/// may not recover the id). We already know this download satisfied the request,
/// so flip its `grabbed` wanted rows to `available` and recompute the request
/// status. Called from the importer when a request-linked download lands.
pub fn on_download_imported<S: HostCtx>(state: &S, request_id: &str) -> Result<()> {
    let conn = state.db().get()?;
    let Some(req) = db::get_request(&conn, request_id)? else {
        return Ok(());
    };
    let wanted = db::wanted_for_request(&conn, request_id)?;
    drop(conn);
    // Rows this request grabbed are now on disk = available.
    let grabbed: Vec<String> =
        wanted.iter().filter(|w| w.status == "grabbed").map(|w| w.id.clone()).collect();
    if !grabbed.is_empty() {
        db::set_wanted_status(state.db(), &grabbed, "available", now_ms())?;
    }
    // Recompute from the (updated) ledger: all available -> available, some -> partial.
    let conn = state.db().get()?;
    let wanted = db::wanted_for_request(&conn, request_id)?;
    drop(conn);
    let status = if wanted.is_empty() || wanted.iter().all(|w| w.status == "available") {
        RequestStatus::Available
    } else if wanted.iter().any(|w| w.status == "available") {
        RequestStatus::PartiallyAvailable
    } else {
        return Ok(()); // nothing became available (shouldn't happen post-import)
    };
    if req.status != status {
        db::set_request_status(state.db(), request_id, status, None, None, now_ms())?;
        publish(state, request_id, status);
        // The download landed and was imported: the requester's "ready to watch"
        // moment. Transition-gated like every other notify site, so a re-import
        // of an already-available request stays quiet.
        let link = request_link(state, &req);
        notify_requester(state, &req, status, &link);
    }
    Ok(())
}

/// Match one request against the local catalog. Returns the (possibly
/// unchanged) derived status, or `None` when no judgement is possible (show
/// not yet in library, pending show with no wanted ledger...). Never
/// downgrades a request that already reached `available`.
pub fn match_one<S: HostCtx>(state: &S, id: &str) -> Result<Option<RequestStatus>> {
    let conn = state.db().get()?;
    let Some(req) = db::get_request(&conn, id)? else {
        return Ok(None);
    };
    match req.kind {
        RequestKind::Movie => match_movie(state, conn, &req),
        RequestKind::Show => match_show(state, conn, &req),
    }
}

/// Match a movie request: available the moment its item is in the catalog.
fn match_movie<S: HostCtx>(
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
        // The film they asked for just landed guarded by the transition above,
        // so a re-match over an already-available request stays quiet.
        let link = request_link(state, req);
        notify_requester(state, req, RequestStatus::Available, &link);
    }
    Ok(Some(RequestStatus::Available))
}

/// Match a show request against the episodes actually present, deriving
/// available / partially-available from the wanted ledger. `None` when no
/// judgement is possible (show not in library, or a pending show with no
/// ledger); never regresses a request that already reached `available`.
fn match_show<S: HostCtx>(
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
        // Pending show: no episode ledger yet, so no exact judgement.
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
    // Never regress a fully-available request (e.g. temporary unmount).
    if req.status == RequestStatus::Available && new_status != RequestStatus::Available {
        return Ok(Some(RequestStatus::Available));
    }
    if new_status != req.status {
        db::set_request_status(state.db(), &req.id, new_status, None, None, now_ms())?;
        // Fires at most twice per show request (pending -> partial -> available),
        // never once per episode: the write above is already transition-gated.
        let link = request_link(state, req);
        notify_requester(state, req, new_status, &link);
    }
    Ok(Some(new_status))
}

/// Tally the wanted ledger against the episodes present: count aired episodes and
/// how many are on disk, collecting the ids that newly became available.
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

/// Today as `YYYY-MM-DD` (UTC), the wanted ledger's air-date vocabulary.
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
        // Whole show (both None) + an episode ask stays whole show, never narrows.
        assert_eq!(merge_target(None, None, None, Some(vec![ep(1, 3)])), (None, None));
        // A subset ask merged into whole show also stays whole show.
        assert_eq!(merge_target(None, None, Some(vec![2]), None), (None, None));
        // Whole-show ask widens an existing subset back to whole show.
        assert_eq!(merge_target(Some(vec![1]), None, None, None), (None, None));
    }

    #[test]
    fn merge_target_unions_seasons_and_episodes() {
        // Seasons union (a None side here is the EMPTY set, not "all").
        assert_eq!(
            merge_target(Some(vec![1]), None, Some(vec![2, 1]), None),
            (Some(vec![1, 2]), None)
        );
        // Episode-only ask unions onto an existing episode-only request.
        assert_eq!(
            merge_target(None, Some(vec![ep(1, 3)]), None, Some(vec![ep(1, 4)])),
            (None, Some(vec![ep(1, 3), ep(1, 4)]))
        );
        // A season subset plus a stray episode coexist as a mixed target.
        assert_eq!(
            merge_target(Some(vec![2]), None, None, Some(vec![ep(1, 5)])),
            (Some(vec![2]), Some(vec![ep(1, 5)]))
        );
        // Duplicate episode across asks collapses to one.
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
        // Terminal requests never refresh.
        assert!(!needs_refresh(&req(RequestKind::Movie, RequestStatus::Denied), now));
        assert!(!needs_refresh(&req(RequestKind::Show, RequestStatus::Failed), now));
        // Throttled: a very recent refresh blocks another one.
        let mut recent = req(RequestKind::Movie, RequestStatus::Approved);
        recent.last_refresh_at = Some(now - 1000);
        assert!(!needs_refresh(&recent, now));
        // Past the throttle window it refreshes again.
        let mut old = req(RequestKind::Movie, RequestStatus::Approved);
        old.last_refresh_at = Some(now - REFRESH_MIN_INTERVAL_MS - 1);
        assert!(needs_refresh(&old, now));
    }

    #[test]
    fn needs_refresh_movie_and_show_rules() {
        let now = 1_000_000_000_000i64;
        // A released movie already in the library will not change.
        assert!(!needs_refresh(&req(RequestKind::Movie, RequestStatus::Available), now));
        // Any other movie state refreshes.
        assert!(needs_refresh(&req(RequestKind::Movie, RequestStatus::Approved), now));
        // An ended show is skipped; an ongoing / unknown one refreshes.
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
        assert_eq!(aired, 3); // e1, e3, e4 (e2 unaired)
        assert_eq!(have, 2); // e1, e3
        assert_eq!(newly, vec!["s1e1".to_string()]); // e3 already available, not re-flagged
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
        // The three components parse as numbers in range.
        let parts: Vec<&str> = today.split('-').collect();
        assert_eq!(parts.len(), 3);
        let (y, m, d): (i32, u8, u8) =
            (parts[0].parse().unwrap(), parts[1].parse().unwrap(), parts[2].parse().unwrap());
        assert!(y >= 2020);
        assert!((1..=12).contains(&m));
        assert!((1..=31).contains(&d));
    }

    // ----- DB-backed matcher tests (a minimal in-process HostCtx double) ----------

    /// The shared stub over a real temp DB pool. The availability matcher +
    /// ledger flips only touch `db()`, `publish()` (counted), `notify()`
    /// (recorded) and `trigger_job()`; everything else stays neutral.
    ///
    /// `module_enabled(false)` is deliberate: these tests must exercise the
    /// no-acquisition-module path, where a request goes to the queue rather than
    /// straight to a downloader.
    type TestHost = kroma_module_host::testing::StubHost;

    use kroma_domain::ParamValue;

    /// A notification param's literal text. Params are typed now (a `Key` is
    /// resolved in the reader's own locale); every one asserted on here is
    /// `Text`, and resolving a key to itself keeps that visible if one changes.
    fn param(params: &std::collections::BTreeMap<String, ParamValue>, key: &str) -> Option<String> {
        params.get(key).map(|v| v.resolve(|k| Some(k.to_string())))
    }

    fn test_host() -> TestHost {
        host_with_tmdb(Some("test-key"))
    }

    /// The same host with TMDB unconfigured - every path into this service needs
    /// it, so its absence is its own set of cases.
    fn host_without_tmdb() -> TestHost {
        host_with_tmdb(None)
    }

    fn host_with_tmdb(key: Option<&str>) -> TestHost {
        // `en-US` rather than the stub's bare `en`: these tests assert on the
        // exact `language=` TMDB is called with.
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

    /// `requests.requested_by` is a foreign key, so an authored request needs a
    /// real account row behind it.
    fn seed_user(host: &TestHost, id: &str) {
        exec(host, &format!("INSERT OR IGNORE INTO users (id,email,username,password_hash,created_at) VALUES ('{id}','{id}@example.test','{id}','x','now')"));
    }

    /// As [`insert_req`], but with an author - the notification paths do nothing
    /// without one.
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
        // No catalog item for tmdb 999 -> matcher cannot decide.
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
        // Only episode 1 is on disk; both are aired and wanted.
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
        // A pending show with no wanted ledger yields no verdict.
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
        // A movie that will match (Approved -> Available: a change).
        seed_movie_item(&host, "m1", 603);
        insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Approved);
        db::replace_wanted(host.db(), "r1", &[wanted("w1", "r1", None, None, None, "wanted")], now_ms())
            .unwrap();
        // A show not in the library (no verdict -> checked but unchanged).
        insert_req(&host, "r2", RequestKind::Show, 1396, RequestStatus::Approved);
        // A denied request is skipped entirely.
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
        // A show ask naming an empty explicit season set targets nothing, so no
        // TMDB season calls happen and the builder refuses an empty ledger.
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
        // A denied request refuses re-approval before any TMDB call happens.
        let err = approve_request(&host, "r1", Some("mod")).unwrap_err();
        assert!(err.to_string().contains("denied"), "unexpected error: {err}");
        // Untouched.
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
        // A Pending show request (no wanted ledger) can widen its season set with
        // no TMDB call, because materialize_wanted only runs once green-lit.
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
        // Merging a subset already covered widens nothing, so nothing is published.
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
        // A request with no wanted rows is never seeded by refresh (only extended),
        // so this returns Ok before any TMDB season fetch.
        let request = req(RequestKind::Show, RequestStatus::Approved);
        let detail = raw_detail(None, None);
        refresh_wanted(&host, &request, &detail).unwrap();
        let conn = host.db().get().unwrap();
        assert!(db::wanted_for_request(&conn, &request.id).unwrap().is_empty());
    }

    #[test]
    fn refresh_pass_skips_all_terminal_and_settled_requests() {
        let host = test_host();
        // Denied + failed are terminal; an available movie can't change either.
        insert_req(&host, "r1", RequestKind::Movie, 1, RequestStatus::Denied);
        insert_req(&host, "r2", RequestKind::Show, 2, RequestStatus::Failed);
        insert_req(&host, "r3", RequestKind::Movie, 3, RequestStatus::Available);
        // Nothing needs a refresh, so no TMDB call is made and the count is zero.
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
        // Only e1 is on disk now, but the request is already Available (e.g. a
        // temporary unmount dropped e2): the matcher must not downgrade it.
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
        // The show is in the library but has none of the aired episodes on disk yet.
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
        // The grabbed row is now available, but one row is still merely wanted.
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::PartiallyAvailable);
        let conn = host.db().get().unwrap();
        let rows = db::wanted_for_request(&conn, "r1").unwrap();
        assert_eq!(rows.iter().filter(|w| w.status == "available").count(), 1);
    }

    #[test]
    fn on_download_imported_no_grabbed_rows_is_noop() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Approved);
        // No grabbed rows: nothing becomes available, status is left as-is.
        db::replace_wanted(host.db(), "r1", &[wanted("w1", "r1", None, None, None, "wanted")], now_ms())
            .unwrap();
        on_download_imported(&host, "r1").unwrap();
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Approved);
        assert_eq!(host.published().len(), 0);
    }

    // ----- notifications ---------------------------------------------------------
    //
    // The whole point of this layer is deciding WHO hears WHAT, and when not to
    // speak at all. None of it touches TMDB.

    fn user(id: &str, permissions: Vec<Permission>) -> User {
        User {
            id: id.into(),
            email: format!("{id}@example.test"),
            username: id.into(),
            avatar_url: None,
            language: None,
            audio_language: None,
            subtitle_language: None,
            permissions,
            created_at: "now".into(),
            has_pin: false,
        }
    }

    /// A request that has an author, so the notification path is not short-circuited.
    fn req_by(kind: RequestKind, status: RequestStatus, requester: &str) -> MediaRequest {
        let mut r = req(kind, status);
        r.requested_by = Some(requester.into());
        r
    }

    #[test]
    fn only_the_four_outcomes_worth_interrupting_someone_for_notify() {
        // Pending is where a request starts, and searching/downloading/importing
        // are machinery nobody asked to watch. Notifying on those would make the
        // feature a nuisance and train people to ignore it.
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
                // A partially-available show is still "there is something to
                // watch now", so it uses the same event.
                NotificationEvent::RequestAvailable,
            ]
        );
        // Each one is addressed to the person who asked, never broadcast.
        for (audience, _) in &sent {
            assert_eq!(audience, &Audience::user("u1"));
        }
        // The i18n key follows the outcome, since the four read very differently.
        assert_eq!(sent[0].1.title_key, "notifications.request.approved.title");
        assert_eq!(sent[1].1.body_key, "notifications.request.denied.body");
        assert_eq!(sent[2].1.title_key, "notifications.request.available.title");
    }

    #[test]
    fn a_request_filed_before_accounts_existed_has_nobody_to_tell() {
        // `requested_by` is NULL for pre-accounts requests; notifying would mean
        // inventing a recipient.
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

        // The same request object approved instead: the note is a denial reason
        // and would read as nonsense attached to good news.
        let mut approved = denied.clone();
        approved.status = RequestStatus::Approved;
        notify_requester(&host, &approved, RequestStatus::Approved, "/requests");

        let sent = host.notifications();
        assert_eq!(param(&sent[0].1.params, "note").as_deref(), Some("we already have this in 4K"));
        assert_eq!(param(&sent[1].1.params, "note"), None);
        // The title is always interpolated, whatever the outcome.
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
        // The button jumps straight into the title rather than the requests list,
        // which is the entire reason it exists.
        assert_eq!(watch.href, "/movie/abc");
        assert_eq!(watch.method, None);
        assert_eq!(available.link.as_deref(), Some("/movie/abc"));
        assert_eq!(available.image_url.as_deref(), Some("https://img.example/p.jpg"));

        // "Approved" is not actionable yet: nothing to watch, so no button.
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
        // Addressed by capability, not by a hardcoded owner: whoever holds the
        // permission is a moderator.
        assert_eq!(audience, &Audience::permission(Permission::RequestsManage));
        assert_eq!(spec.event, NotificationEvent::RequestSubmitted);
        assert_eq!(param(&spec.params, "user").as_deref(), Some("alice"));
        assert_eq!(spec.link.as_deref(), Some("/admin/requests"));
        assert_eq!(spec.push_category, Some(PushCategory::RequestReview));

        let ids: Vec<&str> = spec.actions.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(ids, ["approve", "deny"]);
        for action in &spec.actions {
            // Both are API calls answered in place - a decision costs one tap and
            // no navigation - so both need a method and the request's own id.
            assert_eq!(action.kind, ActionKind::Api);
            assert_eq!(action.method.as_deref(), Some("POST"));
            assert!(action.href.contains("req-7"), "{}", action.href);
        }
        assert_eq!(sent[0].1.actions[0].style, ActionStyle::Primary);
        assert_eq!(sent[0].1.actions[1].style, ActionStyle::Danger);
    }

    #[test]
    fn a_notification_links_to_the_title_once_it_is_in_the_library() {
        // Before the title exists locally there is nothing to link to, so the
        // notification falls back to the requests list.
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
        // The public path end to end: status flip, client event, notification.
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
        // The title happens to be in the library already, so the link points at it.
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
        // Denial is a decision, not a state to bounce out of: re-asking has to go
        // through a new request so the moderator sees it again.
        let host = test_host();
        insert_req(&host, "r-x", RequestKind::Movie, 42, RequestStatus::Denied);
        let err = approve_request(&host, "r-x", Some("mod-1")).unwrap_err().to_string();
        assert!(err.contains("denied"), "{err}");

        let err = approve_request(&host, "ghost", Some("mod-1")).unwrap_err().to_string();
        assert!(err.contains("not found"), "{err}");
    }

    #[test]
    fn creating_a_request_without_tmdb_configured_says_so() {
        // Every path into this service needs TMDB; failing here names the actual
        // problem instead of surfacing a lookup error later.
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
        // One bad TMDB id must not abort the cron for everyone else, and the
        // count reports what actually refreshed - not what was attempted.
        // No TMDB key, so every refresh_one fails at the first step.
        let host = host_without_tmdb();
        insert_req(&host, "r1", RequestKind::Movie, 42, RequestStatus::Approved);
        insert_req(&host, "r2", RequestKind::Movie, 43, RequestStatus::Approved);
        assert_eq!(refresh_pass(&host).unwrap(), 0);

        // A request in a terminal state is skipped before TMDB is ever consulted,
        // so an empty pass is not the same as a failing one.
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
        // A pending request has no wanted rows, and giving it some here would let
        // the search pass start grabbing before a moderator green-lit it.
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 42, RequestStatus::Pending);
        let req = req(RequestKind::Movie, RequestStatus::Pending);
        refresh_wanted(&host, &req, &detail(RequestKind::Movie, 42, Some("2026-01-01"))).unwrap();

        let conn = host.db().get().unwrap();
        assert!(db::wanted_for_request(&conn, "r1").unwrap().is_empty());
    }

    #[test]
    fn refresh_backfills_a_missing_air_date_and_leaves_the_row_alone_otherwise() {
        // The ledger is additive: a row that was already grabbed must keep its
        // status, and a date that is already known must not be rewritten.
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 42, RequestStatus::Approved);
        let undated = wanted("w1", "r1", None, None, None, "grabbed");
        db::insert_wanted(host.db(), std::slice::from_ref(&undated), now_ms()).unwrap();

        let req = req(RequestKind::Movie, RequestStatus::Approved);
        refresh_wanted(&host, &req, &detail(RequestKind::Movie, 42, Some("2026-03-04"))).unwrap();

        let conn = host.db().get().unwrap();
        let rows = db::wanted_for_request(&conn, "r1").unwrap();
        drop(conn);
        assert_eq!(rows.len(), 1, "the movie row is matched, not duplicated");
        assert_eq!(rows[0].air_date.as_deref(), Some("2026-03-04"));
        assert_eq!(rows[0].status, "grabbed", "an in-flight download is untouched");

        // A second pass with a different date changes nothing: the writer guards
        // on air_date IS NULL.
        refresh_wanted(&host, &req, &detail(RequestKind::Movie, 42, Some("2030-01-01"))).unwrap();
        let conn = host.db().get().unwrap();
        let rows = db::wanted_for_request(&conn, "r1").unwrap();
        assert_eq!(rows[0].air_date.as_deref(), Some("2026-03-04"));
    }
    // ----- the whole lifecycle, against a fake TMDB -------------------------------
    //
    // Everything above stops at the first TMDB call. `client::api()` is
    // overridable in test builds, so the REAL client (curl, the api_key param,
    // the JSON decode) can run against a server on localhost - which is what
    // makes create -> approve -> materialise reachable at all.

    use crate::test_support::FakeTmdb;

    /// The TMDB detail body for a movie, with only the fields this flow reads.
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

    /// A show detail plus its season list.
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
        // The title is stored on the request, not re-fetched, so the admin queue
        // reads correctly even if TMDB later goes away.
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
        // ...and the moderators were told it is waiting for them.
        let sent = host.notifications();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].0, Audience::permission(Permission::RequestsManage));
    }

    #[test]
    fn a_tmdb_id_that_does_not_resolve_is_refused_two_different_ways() {
        // Storing it either way would put a row in the queue that can never be
        // fulfilled - but the two failures are genuinely different and the
        // message says which happened.
        seed_user_and_fail(
            // curl -f turns a 404 into a transport failure, indistinguishable
            // from a dead network at this layer.
            |_| (404, json!({ "status_message": "Not Found" })),
            "TMDB lookup failed",
        );
        seed_user_and_fail(
            // A 200 whose body carries neither `title` nor `name`: TMDB answered,
            // and the answer is that there is no such title.
            |_| (200, json!({ "overview": "no title field" })),
            "title not found",
        );
    }

    /// Run `create_request` against a TMDB that answers with `route`, and assert
    /// the error names `expected`.
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
        // Two people asking for the same film is one request, or the moderators
        // review the same title repeatedly.
        let host = test_host();
        let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
        seed_user(&host, "u1");
        seed_user(&host, "u2");

        let first = create_request(&host, &user("u1", vec![Permission::Playback]), &body("u1")).unwrap();
        let second = create_request(&host, &user("u2", vec![Permission::Playback]), &body("u2")).unwrap();
        assert_eq!(first.id, second.id);
        // The author stays the person who asked FIRST.
        assert_eq!(second.requested_by.as_deref(), Some("u1"));
    }

    #[test]
    fn a_requester_who_may_self_approve_skips_the_queue() {
        // `requests.auto` exists so a household's owner does not review their own
        // asks - the request arrives already approved, with a wanted ledger.
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

        // A movie request materialises exactly one wanted row.
        let conn = host.db().get().unwrap();
        let wanted = db::wanted_for_request(&conn, &req.id).unwrap();
        assert_eq!(wanted.len(), 1);
        assert_eq!(wanted[0].kind, "movie");
        assert_eq!(wanted[0].imdb_id.as_deref(), Some("tt0000001"));
        drop(conn);

        // ...and nobody was asked to review it.
        assert!(
            host.notifications().iter().all(|(a, _)| a != &Audience::permission(Permission::RequestsManage)),
            "a self-approved request should not page the moderators"
        );
    }

    #[test]
    fn approving_a_show_builds_one_wanted_row_per_episode_of_every_season() {
        // The ledger is episode-level: that is what lets a season pack and a
        // single episode both satisfy part of one request.
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
        // Asking for season 2 must not queue season 1, and TMDB should not even
        // be asked about it.
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
        // An empty ledger would sit "approved" forever with nothing to search.
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
        // A movie requested before its release date was announced is gated out of
        // search until it is out, then auto-grabbed. That only works if the
        // refresh writes the date once TMDB publishes it.
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

    #[test]
    fn the_api_key_and_language_reach_tmdb_on_every_call() {
        // A request built without them comes back in the wrong language, or
        // unauthenticated.
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
