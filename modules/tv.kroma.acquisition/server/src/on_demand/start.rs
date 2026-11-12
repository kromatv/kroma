//! Whether an on-demand search can start, and the answer a page shows when it
//! cannot.

use anyhow::Result;
use kroma_module_sdk::domain::RequestKind;
use kroma_module_sdk::primitives::now_ms;
use kroma_module_sdk::host::HostStorage;
use serde::Serialize;

use super::lease;
use super::queue::{self, Ask};
use super::{Unit, missing_units};
use crate::peers::indexers::IndexerRef;

pub const ON_DEMAND_JOB: &str = "acquisition.ondemand";
pub const CUTOFF_JOB: &str = "acquisition.cutoff";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NotStarted {
    Busy,
    NoIndexer,
    VpnClosed,
}

/// What a search-now call answers. `units` is how many missing units of the
/// title the run will work through.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Started {
    pub started: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<NotStarted>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub units: Option<usize>,
}

impl Started {
    fn refused(reason: NotStarted) -> Self {
        Self {
            started: false,
            reason: Some(reason),
            units: None,
        }
    }

    fn running(units: Option<usize>) -> Self {
        Self {
            started: true,
            reason: None,
            units,
        }
    }
}

/// What a search needs before it can ask an indexer anything. `acqEnabled` is
/// deliberately not read: it governs the passes that run on their own, and
/// this one an admin asked for.
pub fn ready<S: HostStorage>(state: &S) -> Result<Vec<IndexerRef>, NotStarted> {
    if lease::held(state.store(), now_ms()).unwrap_or(false) {
        return Err(NotStarted::Busy);
    }
    if !crate::peers::downloads::gate_open(state) {
        return Err(NotStarted::VpnClosed);
    }
    match crate::peers::indexers::enabled(state) {
        Ok(found) if !found.is_empty() => Ok(found),
        _ => Err(NotStarted::NoIndexer),
    }
}

/// Queues one title's missing units and kicks the job that searches them.
pub fn start_title_search<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    units: &[Unit],
) -> Result<Started> {
    if let Err(reason) = ready(state) {
        return Ok(Started::refused(reason));
    }
    let open = missing_units(state, kind, tmdb_id, units)?;
    queue::push(
        state.store(),
        &Ask {
            kind,
            tmdb_id,
            units: units.to_vec(),
        },
        now_ms(),
    )?;
    state.trigger_job(ON_DEMAND_JOB, "manual");
    Ok(Started::running(Some(open)))
}

/// Kicks the job that searches every title a better copy could still improve.
pub fn start_cutoff_search<S: HostStorage>(state: &S) -> Result<Started> {
    if let Err(reason) = ready(state) {
        return Ok(Started::refused(reason));
    }
    state.trigger_job(CUTOFF_JOB, "manual");
    Ok(Started::running(None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Json;
    use axum::routing::post;
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::testing::{blocking, serve};
    use serde_json::Value;

    async fn host_with(gate: bool, indexers: Vec<Value>) -> StubHost {
        let list: &'static Vec<Value> = Box::leak(Box::new(indexers));
        let router = axum::Router::new()
            .route(
                "/_port/tv.kroma.torrents/grab/gate-open",
                post(move |Json(_): Json<Value>| async move { Json(gate) }),
            )
            .route(
                "/_port/tv.kroma.indexer/db/enabled",
                post(
                    move |Json(_): Json<Value>| async move { Json(Ok::<_, String>(list.clone())) },
                ),
            );
        let resolve = serve(router, ()).await;
        let (base, token) = resolve().expect("the fakes are up");
        let host = StubHost::with_core(kroma_module_sdk::db::testing::temp_pool("acq-start"))
            .with_point(crate::peers::downloads::DOWNLOAD_GRAB, None, &base, &token)
            .with_point(crate::peers::indexers::INDEXER_DB, None, &base, &token);
        crate::rules::schema::install(host.store());
        host
    }

    fn one_indexer() -> Vec<Value> {
        vec![serde_json::json!({
            "id": "a", "name": "A", "kind": "torznab", "priority": 30, "enabled": true
        })]
    }

    #[test]
    fn a_refusal_says_why_and_promises_nothing() {
        let json = serde_json::to_value(Started::refused(NotStarted::VpnClosed)).unwrap();

        assert_eq!(json["started"], false);
        assert_eq!(json["reason"], "vpnClosed");
        assert!(json["units"].is_null());
    }

    #[test]
    fn a_started_title_search_says_how_many_units_it_will_work_through() {
        let json = serde_json::to_value(Started::running(Some(7))).unwrap();

        assert_eq!(json["started"], true);
        assert_eq!(json["units"], 7);
        assert!(json["reason"].is_null());
    }

    #[tokio::test]
    async fn a_search_an_admin_asked_for_runs_with_background_acquisition_off() {
        let host = host_with(true, one_indexer()).await;

        let answer =
            blocking(move || start_title_search(&host, RequestKind::Show, 1396, &[]).unwrap())
                .await;

        assert!(answer.started, "{answer:?}");
        assert_eq!(answer.units, Some(0));
    }

    #[tokio::test]
    async fn a_search_with_no_indexer_configured_says_which_one_is_missing() {
        let host = host_with(true, Vec::new()).await;

        let answer = blocking(move || start_cutoff_search(&host).unwrap()).await;

        assert_eq!(answer.reason, Some(NotStarted::NoIndexer));
    }

    #[tokio::test]
    async fn a_search_behind_a_closed_kill_switch_says_so_rather_than_grabbing() {
        let host = host_with(false, one_indexer()).await;

        let answer = blocking(move || start_cutoff_search(&host).unwrap()).await;

        assert_eq!(answer.reason, Some(NotStarted::VpnClosed));
    }

    #[tokio::test]
    async fn a_search_asked_for_while_one_runs_says_it_is_busy() {
        let host = host_with(true, one_indexer()).await;
        let held = lease::claim(host.store(), now_ms())
            .unwrap()
            .expect("a free search");

        let answer = blocking(move || start_cutoff_search(&host).unwrap()).await;

        assert_eq!(answer.reason, Some(NotStarted::Busy));
        drop(held);
    }
}
