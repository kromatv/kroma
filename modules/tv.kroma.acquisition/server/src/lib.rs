//! Acquisition orchestration: the quality profile from settings and the search
//! DISPATCH (interactive via [`search`]; the automatic wanted-list pass in
//! [`auto`]), plus grab + import. Its own module so disabling it gates the whole
//! search / grab / auto feature.

#![allow(clippy::result_large_err)]

pub mod auto;
pub mod dtos;
pub mod import;
pub mod jobs;
pub mod peers;
pub mod routes;
pub mod search;
mod serve;
pub mod watch;

pub use dtos::*;
pub use serve::acqsearch_routes;

use kroma_module_sdk::host::HostStorage;
use kroma_scene::{Codec, Profile, Res, UnstatedResolution};

use kroma_module_sdk::engine::services::jobs::now_ms;
use peers::indexers::IndexerRef;

const GB: u64 = 1_073_741_824;

pub const JOBS: &[kroma_module_sdk::engine::services::jobs::Builtin] =
    &[jobs::import::SPEC, jobs::search::SPEC, jobs::match_::SPEC];

pub const MODULE_ID: &str = "tv.kroma.acquisition";

use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

pub fn profile_from_settings<S: HostStorage>(state: &S) -> Profile {
    let resolution = match state.setting_str("acqResolution", "1080p").as_str() {
        "720p" => Res::R720,
        "2160p" => Res::R2160,
        _ => Res::R1080,
    };
    let list = |key: &str| -> Vec<String> {
        state
            .setting_str(key, "")
            .split(',')
            .map(str::trim)
            .filter(|k| !k.is_empty())
            .map(str::to_string)
            .collect()
    };
    Profile {
        resolution,
        unstated_resolution: UnstatedResolution::Refuse,
        preferred_codec: state
            .setting_bool("acqPreferHevc", true)
            .then_some(Codec::Hevc),
        min_seeders: state.setting_i64("acqMinSeeders", 2).max(0) as u32,
        max_size_bytes_movie: (state.setting_i64("acqMaxSizeGbMovie", 15).max(0) as u64) * GB,
        max_size_bytes_episode: (state.setting_i64("acqMaxSizeGbEpisode", 3).max(0) as u64) * GB,
        required_keywords: list("acqRequiredKeywords"),
        forbidden_keywords: list("acqForbiddenKeywords"),
    }
}

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

    fn admin_routes(&self, _host: &S) -> Option<axum::Router<S>> {
        Some(routes::routes::<S>())
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
    import::import_pass(host, &|l| tracing::info!(target: "acquisition", "{l}"))?;
    Ok(())
}

fn run_match<S: HostStorage>(host: &S) -> anyhow::Result<()> {
    kroma_module_sdk::engine::services::requests::availability_pass(host)?;
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
