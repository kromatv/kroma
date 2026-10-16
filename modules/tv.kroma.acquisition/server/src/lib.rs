//! Acquisition orchestration: the quality profile from settings and the search
//! DISPATCH (interactive via [`search`]; the automatic wanted-list pass in
//! [`auto`]), plus grab + import. Its own module so disabling it gates the whole
//! search / grab / auto feature.

#![allow(clippy::result_large_err)]

pub mod auto;
pub mod dtos;
pub mod failures;
pub mod import;
pub mod peers;
pub mod routes;
pub mod rules;
pub mod search;
mod serve;
pub mod titles;
mod upgrades;

pub use dtos::*;
pub use serve::acqsearch_routes;

use kroma_module_sdk::host::HostStorage;

use kroma_module_sdk::engine::services::jobs::now_ms;
use peers::indexers::IndexerRef;

pub const MODULE_ID: &str = "tv.kroma.acquisition";

use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

/// Run one query against one indexer, whatever its kind, returning normalized
/// releases.
pub fn search_indexer<S: HostStorage>(
    state: &S,
    indexer: &IndexerRef,
    query: &peers::indexers::Query,
) -> anyhow::Result<Vec<peers::indexers::Release>> {
    let outcome = peers::indexers::search(state, &indexer.id, query)?;
    // A partial per-path error alongside real results must not flag the indexer
    // as broken.
    let note_ok = !outcome.releases.is_empty() || outcome.errors.is_empty();
    let _ = peers::indexers::note_result(
        state,
        &indexer.id,
        note_ok,
        if note_ok {
            None
        } else {
            outcome.errors.first().map(String::as_str)
        },
        now_ms(),
    );
    if outcome.releases.is_empty() && !outcome.errors.is_empty() {
        anyhow::bail!("{}", outcome.errors.join("; "));
    }
    Ok(outcome.releases)
}

/// Resolve the grabbable target (magnet / .torrent URL) for a built-in release,
/// following the definition's `download` block if the search row carried no
/// direct link.
pub fn resolve_builtin_download<S: HostStorage>(
    state: &S,
    indexer_id: &str,
    title: &str,
    details_url: Option<&str>,
    magnet_or_url: &str,
) -> anyhow::Result<String> {
    Ok(
        peers::indexers::resolve_download(state, indexer_id, title, details_url, magnet_or_url)?
            .link(),
    )
}

/// The Acquisition module's backend behavior: serves the search / analyze / add
/// admin routes and contributes the search / import / match jobs. Disabling it
/// 404s those routes and stops the jobs.
pub struct AcquisitionModule;

#[kroma_module_sdk::host::async_trait]
impl<S: HostStorage + Clone + Send + Sync + 'static> kroma_module_sdk::host::ServerModule<S>
    for AcquisitionModule
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn migrations(&self) -> &'static str {
        rules::store::MIGRATIONS
    }

    fn admin_routes(&self, _host: &S) -> Option<axum::Router<S>> {
        Some(
            routes::routes::<S>()
                .merge(rules::routes::routes::<S>())
                .merge(titles::routes::<S>()),
        )
    }

    fn jobs(&self) -> Vec<kroma_module_sdk::host::ModuleJob<S>> {
        use kroma_module_sdk::host::ModuleJob;
        vec![
            // Import runs often: the cross-sidecar completion trigger can't reach
            // us, so a short cadence catches completed downloads within minutes.
            ModuleJob {
                key: "acquisition.import",
                category: "acquisition",
                schedule: Some("*/5 * * * *"),
                run: run_import::<S>,
            },
            ModuleJob {
                key: "acquisition.search",
                category: "acquisition",
                schedule: Some("*/15 * * * *"),
                run: run_search::<S>,
            },
            ModuleJob {
                key: "acquisition.match",
                category: "acquisition",
                schedule: Some("30 5 * * *"),
                run: run_match::<S>,
            },
            ModuleJob {
                key: "acquisition.refresh",
                category: "acquisition",
                schedule: Some("15 */6 * * *"),
                run: run_refresh::<S>,
            },
        ]
    }
}

fn run_search<S: HostStorage>(host: &S) -> anyhow::Result<()> {
    auto::auto_search_pass(
        host,
        &|l| tracing::info!(target: "acquisition", "{l}"),
        &|| false,
    )?;
    Ok(())
}

fn run_import<S: HostStorage>(host: &S) -> anyhow::Result<()> {
    let log = |l: String| tracing::info!(target: "acquisition", "{l}");
    import::import_pass(host, &log)?;
    failures::failure_pass(host, &log)?;
    Ok(())
}

fn run_match<S: HostStorage>(host: &S) -> anyhow::Result<()> {
    kroma_module_sdk::engine::services::requests::availability_pass(host)?;
    let cleared = import::empty_recycle_bin(host);
    if cleared > 0 {
        tracing::info!(target: "acquisition", "cleared {cleared} file(s) from the recycle bin");
    }
    Ok(())
}

fn run_refresh<S: HostStorage>(host: &S) -> anyhow::Result<()> {
    kroma_module_sdk::engine::services::requests::refresh_pass(host)?;
    Ok(())
}

/// This module's backend behavior, for the host's generic module roster.
pub fn server_module<S: HostStorage + Clone + Send + Sync + 'static>(
) -> Box<dyn kroma_module_sdk::host::ServerModule<S>> {
    Box::new(AcquisitionModule)
}
