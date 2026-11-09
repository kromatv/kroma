//! Admin-facing indexer orchestration: per-indexer capability caching, the
//! native-engine session cache, and the definition store. Moved out of the app's
//! acquisition service so the Indexers module owns its vertical; it reaches the
//! app only through the [`HostCtx`] seam (DB pool, data dir, settings).
//!
//! The interactive/automatic search DISPATCH (`search_indexer`) stays in the app
//! (it belongs to the broader acquisition pipeline); it calls into these.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::db::IndexerRow;
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::host::HostCtx;
use kroma_module_sdk::primitives::now_ms;

use crate::peers;
use crate::store::DefinitionStore;
use crate::{Caps, IndexerConfig, Session};

/// The `kind` of an indexer that runs a Cardigann definition in this process,
/// rather than being an external Torznab endpoint.
pub const KIND_BUILTIN: &str = "builtin";

pub use crate::peers::endpoint_of;

const CAPS_FRESH_FOR: Duration = Duration::from_secs(15 * 60);

struct ProbedCaps {
    at: Instant,
    caps: Caps,
}

// Capabilities are static per indexer, and every search would otherwise pay an
// extra round-trip; keyed by id + url so re-pointing an indexer refreshes.
static CAPS_CACHE: Mutex<Option<HashMap<String, ProbedCaps>>> = Mutex::new(None);

/// `store` is this module's own database, where the last-result column lives.
/// Passed rather than taken off `host`, because the callers reach this through a
/// port contract that names only [`HostCtx`].
pub fn indexer_caps(host: &dyn HostCtx, store: &Pool, row: &IndexerRow) -> anyhow::Result<Caps> {
    let key = format!("{}|{}", row.id, row.url);
    if let Some(caps) = CAPS_CACHE
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|m| m.get(&key))
        .filter(|probed| probed.at.elapsed() < CAPS_FRESH_FOR)
        .map(|probed| probed.caps.clone())
    {
        return Ok(caps);
    }
    let result =
        endpoint_of(host, row).and_then(|endpoint| peers::caps(host, &row.kind, &endpoint));
    match &result {
        Ok(_) => {
            let _ = crate::db::note_indexer_result(store, &row.id, true, None, now_ms());
        }
        Err(e) => {
            let _ = crate::db::note_indexer_result(
                store,
                &row.id,
                false,
                Some(&format!("{e:#}")),
                now_ms(),
            );
        }
    }
    let caps = result?;
    CAPS_CACHE
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(
            key,
            ProbedCaps {
                at: Instant::now(),
                caps: caps.clone(),
            },
        );
    Ok(caps)
}

/// Drop a cached capability entry (config changed / manual test forces a fresh
/// probe), plus any cached built-in session for that indexer.
pub fn invalidate_caps(indexer_id: &str) {
    let prefix = format!("{indexer_id}|");
    if let Some(map) = CAPS_CACHE.lock().unwrap().as_mut() {
        map.retain(|k, _| !k.starts_with(&prefix));
    }
    if let Some(map) = SESSION_CACHE.lock().unwrap().as_mut() {
        map.retain(|k, _| !k.starts_with(&prefix));
    }
}

/// The runtime definition cache (lives under the data dir).
pub fn definition_store(host: &dyn HostCtx) -> DefinitionStore {
    let store = DefinitionStore::new(host.data_dir());
    let route = peers::route_for(host, store.source());
    store.routed(route)
}

/// The job that keeps the definition catalog current.
pub const SYNC_JOB: &str = "indexer.definitions";

/// Start a sync when the catalog is still empty, so it fills while the admin
/// is on the page instead of waiting for the daily run.
pub fn fetch_catalog_if_empty(host: &dyn HostCtx) {
    if definition_store(host).claim_first_sync(now_ms()) {
        host.trigger_job(SYNC_JOB, "catalog-empty");
    }
}

// Keyed so a config change (url / settings / VPN / FlareSolverr) yields a fresh
// session. Reusing one session across a sweep is what makes `requestDelay`
// throttling + the login cookie jar persist across the sweep's requests.
static SESSION_CACHE: Mutex<Option<HashMap<String, Arc<Session>>>> = Mutex::new(None);

fn session_key(host: &dyn HostCtx, row: &IndexerRow, proxy: Option<&str>) -> String {
    let fs = host.setting_str("acqFlaresolverrUrl", "");
    let proxy = proxy.unwrap_or("direct");
    format!("{}|{}|{}|{proxy}|{fs}", row.id, row.url, row.settings)
}

/// Get (or build + cache) the shared session for a `builtin` indexer row.
pub fn builtin_session(
    host: &dyn HostCtx,
    store: &Pool,
    row: &IndexerRow,
) -> anyhow::Result<Arc<Session>> {
    let proxy = peers::route_for(host, &row.url)?;
    let key = session_key(host, row, proxy.as_deref());
    if let Some(s) = SESSION_CACHE
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|m| m.get(&key))
        .cloned()
    {
        return Ok(s);
    }
    let session = Arc::new(build_builtin_session(host, store, row, proxy)?);
    SESSION_CACHE
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(key, session.clone());
    Ok(session)
}

// FlareSolverr fetches the tracker from its own network, so behind the VPN it
// would carry the tracker's URL and cookies around the tunnel.
fn flaresolverr_url(host: &dyn HostCtx, behind_vpn: bool) -> Option<String> {
    let url = host.setting_str("acqFlaresolverrUrl", "");
    let url = url.trim();
    if url.is_empty() {
        return None;
    }
    if behind_vpn {
        tracing::warn!(
            "FlareSolverr is not used while indexers go through the VPN: it would reach the tracker outside the tunnel"
        );
        return None;
    }
    Some(url.to_string())
}

/// Build a live [`Session`] for a `builtin` indexer row, through `proxy` when
/// given. Prefer [`builtin_session`] (cached) on hot paths.
pub fn build_builtin_session(
    host: &dyn HostCtx,
    store: &Pool,
    row: &IndexerRow,
    proxy: Option<String>,
) -> anyhow::Result<Session> {
    let def_id = row
        .definition_id
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("built-in indexer '{}' has no definition", row.name))?;
    let def = definition_store(host).load(def_id)?;
    let settings: HashMap<String, String> = serde_json::from_str(&row.settings).unwrap_or_default();
    let cfg = IndexerConfig {
        base_url: row.url.clone(),
        settings,
    };
    let flaresolverr = flaresolverr_url(host, proxy.is_some());

    Ok(Session::new(
        store.clone(),
        host.data_dir(),
        &row.id,
        def,
        cfg,
        proxy,
        flaresolverr,
    ))
}

/// Capabilities for any indexer kind (native ones derive from the definition; no
/// network round-trip).
pub fn any_indexer_caps(
    host: &dyn HostCtx,
    store: &Pool,
    row: &IndexerRow,
) -> anyhow::Result<Caps> {
    if row.kind == KIND_BUILTIN {
        let def = definition_store(host).load(
            row.definition_id
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("no definition"))?,
        )?;
        Ok(Caps::from_definition(&def))
    } else {
        indexer_caps(host, store, row)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use axum::routing::post;
    use axum::{Json, Router};
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::host::HostStorage as _;
    use serde_json::json;

    use super::*;
    use crate::db;

    static PROBES: AtomicUsize = AtomicUsize::new(0);

    async fn answer_caps() -> Json<serde_json::Value> {
        PROBES.fetch_add(1, Ordering::SeqCst);
        Json(json!({ "Ok": { "search_tmdb": true } }))
    }

    fn row(id: &str) -> IndexerRow {
        IndexerRow {
            id: id.into(),
            name: id.into(),
            url: "http://tracker.example/api".into(),
            api_key: String::new(),
            categories: vec![2000],
            enabled: true,
            priority: 0,
            kind: "torznab".into(),
            definition_id: None,
            settings: "{}".into(),
            last_ok_at: None,
            last_error: None,
            created_at: 0,
        }
    }

    fn age_every_probe() {
        for probed in CAPS_CACHE.lock().unwrap().as_mut().unwrap().values_mut() {
            probed.at = Instant::now() - CAPS_FRESH_FOR;
        }
    }

    async fn host_with_an_engine() -> StubHost {
        let pool = kroma_module_sdk::db::testing::temp_pool("indexer-admin");
        kroma_module_sdk::db::apply_migrations(&pool.get().unwrap(), db::MIGRATIONS).unwrap();
        let engine = Router::new().route("/_port/tv.kroma.indexer/engine/caps", post(answer_caps));
        let resolve = kroma_module_sdk::testing::serve(engine, ()).await;
        let (base, token) = resolve().unwrap();
        StubHost::with_store((*pool).clone()).with_point(
            peers::ENGINE,
            Some("torznab"),
            &base,
            &token,
        )
    }

    #[tokio::test]
    async fn a_probe_is_reused_while_fresh_and_made_again_once_it_is_not() {
        let host = host_with_an_engine().await;
        let row = row("caps-ttl");

        let probes = kroma_module_sdk::testing::blocking(move || {
            indexer_caps(&host, host.store(), &row).unwrap();
            indexer_caps(&host, host.store(), &row).unwrap();
            let while_fresh = PROBES.load(Ordering::SeqCst);
            age_every_probe();
            indexer_caps(&host, host.store(), &row).unwrap();
            (while_fresh, PROBES.load(Ordering::SeqCst))
        })
        .await;

        assert_eq!(probes, (1, 2));
    }
}
