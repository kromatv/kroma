//! `GET /downloads` one page of the queue + history, narrowed by the filter
//! bar and rolled up by the stat cards above it.

use std::collections::HashMap;

use axum::extract::{Query as AxQuery, State};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use kroma_module_sdk::host::{query, AuthUser, HostStorage};

use super::view::{to_view, RowContext};
use super::{dm, require_downloads};
use crate::db::{self, DownloadFilter, DownloadOrder};
use crate::downloads::LiveStat;
use crate::{DownloadStatsView, DownloadsView, PageView};

const DEFAULT_PER_PAGE: u32 = 10;
// One page has to stay small enough that the per-row request/catalog lookups
// below cost less than the poll interval.
const MAX_PER_PAGE: u32 = 100;

fn statuses_in_group(group: &str) -> Vec<String> {
    let names: &[&str] = match group {
        "active" => &["queued", "downloading", "seeding", "paused"],
        "done" => &["completed", "imported"],
        "failed" => &["failed", "removed"],
        "all" | "" => &[],
        one => return vec![one.to_string()],
    };
    names.iter().copied().map(str::to_string).collect()
}

fn comma_list(raw: Option<&str>) -> Vec<String> {
    raw.map(|value| {
        value
            .split(',')
            .map(str::trim)
            .filter(|part| !part.is_empty() && *part != "all")
            .map(str::to_string)
            .collect()
    })
    .unwrap_or_default()
}

fn expand_status_groups(raw: Option<&str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for group in comma_list(raw) {
        for status in statuses_in_group(&group) {
            if !out.contains(&status) {
                out.push(status);
            }
        }
    }
    out
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListParams {
    #[serde(default)]
    page: Option<u32>,
    #[serde(default)]
    per_page: Option<u32>,
    /// Comma-separated groups (`active` | `done` | `failed`) or exact statuses;
    /// several union.
    #[serde(default)]
    status: Option<String>,
    /// Comma-separated engine ids.
    #[serde(default)]
    client_id: Option<String>,
    /// Comma-separated `movie` | `season` | `episode`.
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    q: Option<String>,
    #[serde(default)]
    unlinked: Option<bool>,
    #[serde(default)]
    sort: Option<String>,
    #[serde(default)]
    dir: Option<String>,
}

fn trimmed(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty() && v != "all")
}

impl ListParams {
    fn filter(&self) -> DownloadFilter {
        DownloadFilter {
            statuses: expand_status_groups(self.status.as_deref()),
            client_ids: comma_list(self.client_id.as_deref()),
            kinds: comma_list(self.kind.as_deref()),
            search: trimmed(self.q.clone()),
            unlinked: self.unlinked.unwrap_or(false),
        }
    }

    fn order(&self) -> DownloadOrder {
        DownloadOrder::parse(self.sort.as_deref(), self.dir.as_deref())
    }

    fn per_page(&self) -> u32 {
        self.per_page
            .unwrap_or(DEFAULT_PER_PAGE)
            .clamp(1, MAX_PER_PAGE)
    }
}

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/downloads", get(list::<S>))
}

pub async fn list<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxQuery(params): AxQuery<ListParams>,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    let manager = dm(&state);
    let vpn = manager.vpn_status();
    let history = manager.speed_history();
    // Polled from the engine so the panel still has stats when the live
    // WebSocket can't reach the client. Blocking: engine stats run off the
    // runtime.
    let live: HashMap<String, LiveStat> = {
        let mgr = manager.clone();
        tokio::task::spawn_blocking(move || mgr.live_stats())
            .await
            .unwrap_or_default()
    };
    // Resolved before the blocking closure, which cannot borrow the host.
    let indexers: HashMap<String, String> = crate::port::indexers::names(&state)
        .into_iter()
        .map(|i| (i.id, i.name))
        .collect();
    // The client names come from this module's OWN database; the ledger below
    // from the shared one. Two files, so two lookups: resolved here because the
    // blocking closure gets only the one pool.
    let clients: HashMap<String, String> = query(state.store(), |pool| {
        let conn = pool.get()?;
        Ok(db::list_download_clients(&conn)?
            .into_iter()
            .map(|c| (c.id, c.name))
            .collect())
    })
    .await
    .unwrap_or_default();

    let filter = params.filter();
    let order = params.order();
    let per_page = params.per_page();
    let view = query(state.db(), move |pool| {
        let conn = pool.get()?;
        let total = db::count_downloads(&conn, &filter)?;
        let page_count = (total as f64 / f64::from(per_page)).ceil().max(1.0) as u32;
        let page = params.page.unwrap_or(1).clamp(1, page_count);
        let offset = i64::from(page - 1) * i64::from(per_page);
        let rows = db::page_downloads(&conn, &filter, order, offset, i64::from(per_page))?;
        let totals = db::download_totals(&conn)?;

        let ctx = RowContext {
            indexers: &indexers,
            clients: &clients,
            live: &live,
        };
        let downloads = rows
            .into_iter()
            .map(|row| to_view(&conn, &ctx, row))
            .collect();
        let stats = DownloadStatsView {
            down_bps: live.values().map(|s| s.down_bps).sum(),
            up_bps: live.values().map(|s| s.up_bps).sum(),
            peers: live.values().map(|s| s.peers).sum(),
            active: db::running_download_count(&conn)?,
            by_status: totals.by_status,
            total_downloaded_bytes: totals.downloaded_bytes,
            total_uploaded_bytes: totals.uploaded_bytes,
            history,
        };
        Ok(DownloadsView {
            downloads,
            vpn,
            page: PageView {
                page,
                per_page,
                total,
                page_count,
            },
            stats,
        })
    })
    .await?;
    Ok(Json(view).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{DownloadSort, SortDirection};

    #[test]
    fn a_group_expands_to_its_statuses_and_a_bare_status_stands_for_itself() {
        assert_eq!(statuses_in_group("active").len(), 4);
        assert_eq!(statuses_in_group("done"), ["completed", "imported"]);
        assert_eq!(statuses_in_group("seeding"), ["seeding"]);
        assert!(statuses_in_group("all").is_empty());
        assert!(statuses_in_group("").is_empty());
    }

    #[test]
    fn per_page_is_clamped_and_blank_filters_drop_out() {
        let params = ListParams {
            per_page: Some(5_000),
            client_id: Some("  ".into()),
            kind: Some("all".into()),
            q: Some("  frieren ".into()),
            ..ListParams::default()
        };

        let filter = params.filter();

        assert_eq!(params.per_page(), MAX_PER_PAGE);
        assert!(filter.client_ids.is_empty());
        assert!(filter.kinds.is_empty());
        assert_eq!(filter.search.as_deref(), Some("frieren"));
    }

    #[test]
    fn several_filters_of_one_kind_union_and_never_repeat_a_status() {
        let params = ListParams {
            status: Some("done,failed".into()),
            kind: Some("movie, season".into()),
            client_id: Some("embedded,box".into()),
            ..ListParams::default()
        };

        let filter = params.filter();

        assert_eq!(
            filter.statuses,
            ["completed", "imported", "failed", "removed"]
        );
        assert_eq!(filter.kinds, ["movie", "season"]);
        assert_eq!(filter.client_ids, ["embedded", "box"]);
    }

    #[test]
    fn a_sort_name_nobody_defined_orders_by_the_default_instead_of_failing() {
        let hostile = ListParams {
            sort: Some("grabbed_at) --".into()),
            dir: Some("'; DROP TABLE downloads".into()),
            ..ListParams::default()
        };
        let asked = ListParams {
            sort: Some("progress".into()),
            dir: Some("asc".into()),
            ..ListParams::default()
        };

        assert_eq!(hostile.order(), DownloadOrder::default());
        assert_eq!(asked.order().sort, DownloadSort::Progress);
        assert_eq!(asked.order().direction, SortDirection::Ascending);
    }

    #[test]
    fn overlapping_groups_do_not_ask_for_the_same_status_twice() {
        let params = ListParams {
            status: Some("failed,failed".into()),
            ..ListParams::default()
        };

        assert_eq!(params.filter().statuses, ["failed", "removed"]);
    }
}
