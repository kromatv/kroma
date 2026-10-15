//! Flagging TMDB hits against this server: the catalogue row a title already
//! has in a library the viewer was granted, and for a viewer who may request,
//! the request covering it with its live download.

use std::collections::HashMap;

use rusqlite::Connection;

use crate::api::downloads_overlay::{active_downloads, ActiveDownload};
use crate::db;
use crate::infra::metadata::discover;
use crate::model::{
    DiscoverDetail, DiscoverEntry, DiscoverSeason, Permission, RequestKind, RequestStatus, User,
};

/// What a viewer is shown beside the catalogue flags.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Overlay {
    Requests,
    Catalogue,
}

impl Overlay {
    pub fn for_viewer(user: &User) -> Self {
        if user.can(Permission::RequestsCreate) {
            Self::Requests
        } else {
            Self::Catalogue
        }
    }

    fn request_for(
        self,
        conn: &Connection,
        kind: RequestKind,
        tmdb_id: u64,
    ) -> rusqlite::Result<Option<(String, RequestStatus)>> {
        match self {
            Self::Requests => db::latest_request_for(conn, kind, tmdb_id),
            Self::Catalogue => Ok(None),
        }
    }
}

fn local_id_for(
    conn: &Connection,
    kind: RequestKind,
    tmdb_id: u64,
    viewer: &User,
) -> anyhow::Result<Option<String>> {
    Ok(db::titles_by_tmdb(conn, kind, tmdb_id)?
        .into_iter()
        .find(|(_, library)| viewer.sees_library(library))
        .map(|(id, _)| id))
}

pub fn flag_hits(
    conn: &Connection,
    hits: Vec<discover::DiscoverHit>,
    viewer: &User,
) -> anyhow::Result<Vec<DiscoverEntry>> {
    // One pass over the download ledger (not per-hit), so cards can show the
    // live downloading/importing phase + progress.
    let active = active_downloads(conn);
    flag_hits_with(conn, hits, &active, viewer)
}

// Reuses an already-built active-download map so a caller (the detail page)
// doesn't re-aggregate the download ledger a second time.
fn flag_hits_with(
    conn: &Connection,
    hits: Vec<discover::DiscoverHit>,
    active: &HashMap<String, ActiveDownload>,
    viewer: &User,
) -> anyhow::Result<Vec<DiscoverEntry>> {
    let overlay = Overlay::for_viewer(viewer);
    hits.into_iter()
        .map(|h| {
            let local_id = local_id_for(conn, h.kind, h.tmdb_id, viewer)?;
            let request = overlay.request_for(conn, h.kind, h.tmdb_id)?;
            let (status, progress) = overlay_active(active, request.as_ref());
            Ok(DiscoverEntry {
                kind: h.kind,
                tmdb_id: h.tmdb_id,
                title: h.title,
                year: h.year,
                poster_url: h.poster_url,
                backdrop_url: h.backdrop_url,
                overview: h.overview,
                rating: h.rating,
                in_library: local_id.is_some(),
                local_id,
                request_id: request.as_ref().map(|(id, _)| id.clone()),
                request_status: status,
                request_progress: progress,
            })
        })
        .collect()
}

fn overlay_active(
    active: &HashMap<String, ActiveDownload>,
    request: Option<&(String, RequestStatus)>,
) -> (Option<RequestStatus>, Option<f64>) {
    let mut status = request.map(|(_, s)| *s);
    let mut progress = None;
    if let Some((rid, _)) = request {
        if let Some(a) = active.get(rid) {
            if matches!(
                status,
                Some(RequestStatus::Approved | RequestStatus::PartiallyAvailable)
            ) {
                status = Some(if a.importing {
                    RequestStatus::Importing
                } else {
                    RequestStatus::Downloading
                });
                progress = Some(a.progress);
            }
        }
    }
    (status, progress)
}

pub fn flag_detail(
    conn: &Connection,
    d: discover::DiscoverRawDetail,
    viewer: &User,
) -> anyhow::Result<DiscoverDetail> {
    let overlay = Overlay::for_viewer(viewer);
    let local_id = local_id_for(conn, d.kind, d.tmdb_id, viewer)?;
    let request = overlay.request_for(conn, d.kind, d.tmdb_id)?;

    let active = active_downloads(conn);
    let (request_status, request_progress) = overlay_active(&active, request.as_ref());

    // Season flags: available = every listed episode is on disk; requested =
    // covered by the newest open request (None = whole show).
    let mut seasons: Vec<DiscoverSeason> = Vec::with_capacity(d.seasons.len());
    if d.kind == RequestKind::Show && !d.seasons.is_empty() {
        let present = match &local_id {
            Some(show_id) => db::episodes_present(conn, show_id)?,
            None => Vec::new(),
        };
        let mut per_season: HashMap<u32, u32> = HashMap::new();
        for (s, _e) in present {
            *per_season.entry(s).or_default() += 1;
        }
        let open_request = match overlay {
            Overlay::Requests => db::find_open_request(conn, RequestKind::Show, d.tmdb_id)?,
            Overlay::Catalogue => None,
        };
        let requested_seasons: Option<Vec<u32>> = open_request.as_ref().map(|r| {
            r.seasons
                .clone()
                .unwrap_or_else(|| d.seasons.iter().map(|s| s.season).collect())
        });
        for s in &d.seasons {
            let have = per_season.get(&s.season).copied().unwrap_or(0);
            seasons.push(DiscoverSeason {
                season: s.season,
                name: s.name.clone(),
                episode_count: s.episode_count,
                air_date: s.air_date.clone(),
                available: s.episode_count > 0 && have >= s.episode_count,
                episodes_available: have,
                requested: requested_seasons
                    .as_ref()
                    .is_some_and(|list| list.contains(&s.season)),
            });
        }
    }

    let air_status = d.status.clone();
    let next_air_date = match d.kind {
        RequestKind::Show => d.next_air.as_ref().map(|(dt, _, _)| dt.clone()),
        RequestKind::Movie => d.available_date.clone(),
    };

    Ok(DiscoverDetail {
        kind: d.kind,
        tmdb_id: d.tmdb_id,
        title: d.title,
        year: d.year,
        poster_url: d.poster_url,
        backdrop_url: d.backdrop_url,
        overview: d.overview,
        tagline: d.tagline,
        genres: d.genres,
        tmdb_genre_ids: d.tmdb_genre_ids,
        rating: d.rating,
        runtime_min: d.runtime_min,
        seasons,
        cast: d.cast,
        crew: d.crew,
        similar: flag_hits_with(conn, d.similar, &active, viewer)?,
        in_library: local_id.is_some(),
        local_id,
        request_id: request.as_ref().map(|(id, _)| id.clone()),
        request_status,
        request_progress,
        air_status,
        next_air_date,
    })
}

#[cfg(test)]
mod tests;
