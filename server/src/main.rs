//! KROMA a self-hosted, direct-play media streaming server.
//!
//! Scans a media library into SQLite, exposes it over a JSON REST API, and
//! range-streams the original files. It never transcodes; `ffprobe` only reads
//! metadata.
//!
//! This is the composition root, and the whole of it: config, database, state,
//! background work, serve. Everything it builds lives under `boot/`, and none of
//! it names a module.

// Request guards use the axum `Response` as their Err type so handlers can `?`.
#![allow(clippy::result_large_err)]

mod api;
mod boot;
mod tls;

// Only `api/test_support` reaches the config through the crate root.
#[cfg(test)]
use kroma_config as config;
use kroma_config::Config;
// Re-exported under `crate::*` because the whole `api/` tree reaches the engine
// through the binary's own paths.
use kroma_db as db;
use kroma_engine::{i18n, infra, model, services, state};

// musl's global-lock malloc collapses under our thread mix (tokio workers +
// rayon walks + candle tensors); mimalloc removes that contention.
#[cfg(target_os = "linux")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::from_env();
    // Held for the whole process so buffered log lines flush to disk.
    let _log_guard = boot::tracing::init_tracing(&config.logs_dir());
    let ffprobe_available = boot::startup::announce(&config);

    let db = boot::startup::open_db(&config)?;
    let settings = services::settings::Settings::load(&db);

    // The startup walk stats every file in every library, which on a network
    // mount is seconds to minutes and all of it latency. A server that already
    // has an index serves it and rescans behind the open port.
    let plan = boot::scan::plan(&db, &config, &settings)?;
    let addr = config.socket_addr();

    let (state, supervisor) = boot::state::build(config, ffprobe_available, db, settings);
    plan.applied(&state);

    boot::background::spawn(&state).await;
    plan.deferred(&state);

    boot::serve::run(state, supervisor, addr).await
}
