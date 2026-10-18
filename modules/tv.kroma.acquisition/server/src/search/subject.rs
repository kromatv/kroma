//! What a search is for: a request, or a title by its TMDB identity, and the
//! ledger rows each one is searched against.

use anyhow::{Result, anyhow};
use kroma_module_sdk::db::{self, WantedRow};
use kroma_module_sdk::engine::model::{MediaRequest, RequestKind};
use kroma_module_sdk::host::HostStorage;
use serde::Deserialize;

use super::targets::SearchScope;

/// The thing a search and its grab answer to.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Subject {
    #[serde(rename_all = "camelCase")]
    Request { request_id: String },
    #[serde(rename_all = "camelCase")]
    Title { kind: RequestKind, tmdb_id: u64 },
}

impl Subject {
    pub fn request(id: &str) -> Self {
        Subject::Request {
            request_id: id.to_string(),
        }
    }

    pub fn cache_key(&self, scope: SearchScope) -> String {
        match self {
            Subject::Request { request_id } => format!("{request_id}|{}", scope.cache_key()),
            Subject::Title { kind, tmdb_id } => {
                format!("{}:{tmdb_id}|{}", kind.as_str(), scope.cache_key())
            }
        }
    }
}

/// A subject, resolved: the title it is about, the ledger as it stands, and the
/// rows a search over a scope is aimed at.
pub struct Resolved {
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub title: String,
    pub year: Option<u32>,
    pub request_id: Option<String>,
    pub ledger: Vec<WantedRow>,
    pub searched: Vec<WantedRow>,
}

pub fn resolve<S: HostStorage>(
    state: &S,
    subject: &Subject,
    scope: SearchScope,
) -> Result<Resolved> {
    match subject {
        Subject::Request { request_id } => resolve_request(state, request_id, scope),
        Subject::Title { kind, tmdb_id } => resolve_title(state, *kind, *tmdb_id, scope),
    }
}

fn resolve_request<S: HostStorage>(state: &S, id: &str, scope: SearchScope) -> Result<Resolved> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request not found"))?;
    let mut ledger = db::wanted_for_request(&conn, id)?;
    drop(conn);
    // A pending request has no ledger yet: search as if it were approved, so a
    // moderator can look before green-lighting.
    if ledger.is_empty() {
        kroma_module_sdk::engine::services::requests::preview_wanted(state, &req, &mut ledger)?;
    }
    let mut searched = forced_wanted(&ledger);
    searched.extend(rows_outside_request(state, &req, &searched, scope)?);
    Ok(Resolved {
        kind: req.kind,
        tmdb_id: req.tmdb_id,
        title: req.title,
        year: req.year,
        request_id: Some(req.id),
        ledger,
        searched,
    })
}

fn resolve_title<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    scope: SearchScope,
) -> Result<Resolved> {
    let conn = state.db().get()?;
    let ledger = db::wanted_for_title(&conn, kind, tmdb_id)?;
    let monitored = db::get_monitored(&conn, kind, tmdb_id)?;
    let request_id = db::find_open_request(&conn, kind, tmdb_id)?.map(|r| r.id);
    drop(conn);
    let mut searched = forced_wanted(&ledger);
    let uncovered = match scope.season() {
        Some(season) => !searched.iter().any(|w| w.season == Some(season)),
        None => searched.is_empty(),
    };
    if uncovered {
        let previews = kroma_module_sdk::engine::services::monitoring::preview_rows(
            state,
            kind,
            tmdb_id,
            scope.season(),
        )?;
        let fresh: Vec<WantedRow> = previews
            .into_iter()
            .filter(|row| {
                !searched
                    .iter()
                    .any(|w| (w.season, w.episode) == (row.season, row.episode))
            })
            .collect();
        searched.extend(fresh);
    }
    let sample = searched.first();
    Ok(Resolved {
        kind,
        tmdb_id,
        title: monitored
            .as_ref()
            .map(|m| m.title.clone())
            .or_else(|| sample.map(|w| w.title.clone()))
            .unwrap_or_default(),
        year: monitored
            .and_then(|m| m.year)
            .or(sample.and_then(|w| w.year)),
        request_id,
        ledger,
        searched,
    })
}

// An explicit search covers everything in reach whatever its state, so a row
// already grabbed or on disk can be searched again: the target builders only
// look at `wanted` rows, so they get a copy that says so.
fn forced_wanted(ledger: &[WantedRow]) -> Vec<WantedRow> {
    ledger
        .iter()
        .cloned()
        .map(|mut w| {
            w.status = "wanted".into();
            w
        })
        .collect()
}

// The rows are synthesized from TMDB and never persisted, so a grab of one flips
// no ledger row: the availability pass picks the file up once it lands.
fn rows_outside_request<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    wanted: &[WantedRow],
    scope: SearchScope,
) -> Result<Vec<WantedRow>> {
    let Some(season) = scope.season() else {
        return Ok(Vec::new());
    };
    if wanted.iter().any(|w| w.season == Some(season)) {
        return Ok(Vec::new());
    }
    kroma_module_sdk::engine::services::request_ledger::preview_season_rows(state, req, season)
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::db::testing::temp_pool;
    use kroma_module_sdk::engine::model::RequestStatus;
    use kroma_module_sdk::host::testing::StubHost;

    use super::*;
    use crate::search::best::test_world::{monitor, monitored, want, wanted_row};

    #[test]
    fn a_request_and_a_title_never_share_a_cache_slot() {
        let request = Subject::request("603");
        let title = Subject::Title {
            kind: RequestKind::Movie,
            tmdb_id: 603,
        };

        assert_ne!(
            request.cache_key(SearchScope::All),
            title.cache_key(SearchScope::All)
        );
    }

    #[test]
    fn a_subject_reads_from_its_json() {
        let title: Subject = serde_json::from_value(
            serde_json::json!({ "type": "title", "kind": "show", "tmdbId": 77 }),
        )
        .unwrap();
        let request: Subject =
            serde_json::from_value(serde_json::json!({ "type": "request", "requestId": "r1" }))
                .unwrap();

        assert_eq!(
            title,
            Subject::Title {
                kind: RequestKind::Show,
                tmdb_id: 77
            }
        );
        assert_eq!(request, Subject::request("r1"));
    }

    fn host() -> StubHost {
        StubHost::with_core(temp_pool("acq-subject"))
    }

    fn approve(host: &StubHost, id: &str, kind: RequestKind, tmdb_id: u64) {
        let request = db::NewRequest {
            id: id.into(),
            kind,
            tmdb_id,
            title: "Show".into(),
            year: Some(2020),
            poster_url: None,
            seasons: None,
            episodes: None,
            status: RequestStatus::Approved,
            requested_by: None,
        };
        db::insert_request(host.db(), &request, 1).unwrap();
    }

    fn show_ledger(host: &StubHost, request_id: Option<&str>) {
        let show = monitored(RequestKind::Show, 1, "Show", Some(2020));
        monitor(host, &show);
        let mut rows = vec![
            wanted_row("a", &show, Some(1), Some(1), "wanted"),
            wanted_row("b", &show, Some(1), Some(2), "available"),
        ];
        for row in &mut rows {
            row.request_id = request_id.map(str::to_string);
        }
        want(host, &rows);
    }

    fn title(kind: RequestKind, tmdb_id: u64) -> Subject {
        Subject::Title { kind, tmdb_id }
    }

    #[test]
    fn a_titles_search_covers_every_row_whatever_its_state() {
        let host = host();
        show_ledger(&host, None);

        let resolved = resolve(&host, &title(RequestKind::Show, 1), SearchScope::All).unwrap();

        assert_eq!(resolved.title, "Show");
        assert_eq!(resolved.year, Some(2020));
        assert_eq!(resolved.ledger.len(), 2);
        assert!(resolved.searched.iter().all(|w| w.status == "wanted"));
        assert_eq!(resolved.searched.len(), 2);
        assert_eq!(resolved.request_id, None);
    }

    #[test]
    fn a_title_nobody_monitors_is_named_by_the_rows_it_has() {
        let host = host();
        let unmonitored = monitored(RequestKind::Movie, 5, "Dune", Some(2021));
        want(&host, &[wanted_row("m", &unmonitored, None, None, "wanted")]);

        let resolved = resolve(&host, &title(RequestKind::Movie, 5), SearchScope::Movie).unwrap();

        assert_eq!(resolved.title, "Dune");
        assert_eq!(resolved.year, Some(2021));
    }

    #[test]
    fn a_title_with_an_open_request_carries_the_request() {
        let host = host();
        show_ledger(&host, None);
        approve(&host, "r1", RequestKind::Show, 1);

        let resolved = resolve(&host, &title(RequestKind::Show, 1), SearchScope::All).unwrap();

        assert_eq!(resolved.request_id.as_deref(), Some("r1"));
    }

    #[test]
    fn a_season_the_ledger_already_covers_adds_no_preview_rows() {
        let host = host();
        show_ledger(&host, None);

        let resolved = resolve(
            &host,
            &title(RequestKind::Show, 1),
            SearchScope::Season { season: 1 },
        )
        .unwrap();

        assert_eq!(resolved.searched.len(), 2);
    }

    #[test]
    fn a_requests_search_reads_the_ledger_it_was_approved_with() {
        let host = host();
        approve(&host, "r1", RequestKind::Show, 1);
        show_ledger(&host, Some("r1"));

        let resolved = resolve(&host, &Subject::request("r1"), SearchScope::All).unwrap();

        assert_eq!(resolved.request_id.as_deref(), Some("r1"));
        assert_eq!(resolved.tmdb_id, 1);
        assert_eq!(resolved.ledger.len(), 2);
        assert!(resolved.searched.iter().all(|w| w.status == "wanted"));
    }

    #[test]
    fn a_season_of_a_request_the_ledger_covers_is_not_previewed() {
        let host = host();
        approve(&host, "r1", RequestKind::Show, 1);
        show_ledger(&host, Some("r1"));

        let resolved = resolve(
            &host,
            &Subject::request("r1"),
            SearchScope::Season { season: 1 },
        )
        .unwrap();

        assert_eq!(resolved.searched.len(), 2);
    }

    #[test]
    fn a_request_nobody_filed_is_not_found() {
        let host = host();

        let err = resolve(&host, &Subject::request("ghost"), SearchScope::All).err();

        assert_eq!(err.unwrap().to_string(), "request not found");
    }
}
