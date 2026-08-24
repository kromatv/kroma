use anyhow::{anyhow, Result};

use kroma_module_host::HostStorage;

use crate::db;
use crate::infra::metadata::discover;
use crate::model::{
    CreateRequestBody, EpisodeRef, MediaRequest, Permission, RequestKind, RequestStatus, User,
};
use crate::services::jobs::now_ms;

use super::availability::match_one;
use super::notify::{notify_moderators, publish};
use super::review::approve_request;
use super::wanted::{materialize_wanted, merge_target, normalize_episodes};
use super::{language, tmdb_key};

#[cfg(test)]
mod tests;

/// Create (or duplicate-merge) a request. Auto-approves when the requester
/// holds `requests.auto`.
pub fn create_request<S: HostStorage>(
    state: &S,
    user: &User,
    body: &CreateRequestBody,
) -> Result<MediaRequest> {
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
        db::set_request_seasons(
            state.db(),
            &existing.id,
            merged_seasons.as_deref(),
            now_ms(),
        )?;
    }
    if episodes_changed {
        db::set_request_episodes(
            state.db(),
            &existing.id,
            merged_episodes.as_deref(),
            now_ms(),
        )?;
    }
    if seasons_changed || episodes_changed {
        if matches!(
            existing.status,
            RequestStatus::Approved | RequestStatus::PartiallyAvailable
        ) {
            materialize_wanted(state, &existing.id)?;
        }
        publish(state, &existing.id, existing.status);
    }
    Ok(())
}
