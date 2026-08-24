//! The first few seconds: what the process reports about itself, and opening
//! the database (core schema plus every module's).

use anyhow::Context;
use kroma_config::Config;
use kroma_db as db;
use kroma_engine::infra;
use tracing::{info, warn};

/// Log what this build is and what it found, and report whether `ffprobe` is
/// available (which decides how much metadata the scan can extract).
pub fn announce(config: &Config) -> bool {
    kroma_engine::process_started();
    // Only the binary knows the released version; the engine crate's own
    // CARGO_PKG_VERSION is a stale 0.1.0.
    kroma_engine::services::settings::set_build_info(
        env!("CARGO_PKG_VERSION"),
        env!("KROMA_GIT_HASH"),
        env!("KROMA_BUILD_DATE"),
    );
    info!(
        host = %config.host,
        port = config.port,
        media_dirs = config.media_dirs.len(),
        db = %config.db_path().display(),
        "starting KROMA server"
    );

    let ffprobe_available = infra::probe::ffprobe_available();
    if ffprobe_available {
        info!("ffprobe detected: full metadata extraction enabled");
    } else {
        warn!("ffprobe not found: metadata will be inferred from file extensions");
    }
    if config.tmdb_api_key.is_some() {
        if infra::metadata::curl_available() {
            info!(language = %config.tmdb_language, "TMDB enrichment enabled");
        } else {
            warn!("KROMA_TMDB_API_KEY is set but `curl` was not found; TMDB enrichment disabled");
        }
    }
    ffprobe_available
}

/// Open the database and bring every schema up to date. The module migrations
/// must land before anything reads their tables.
pub fn open_db(config: &Config) -> anyhow::Result<db::Pool> {
    let pool = db::init(&config.db_path()).context("failed to initialise database")?;
    let conn = pool
        .get()
        .context("failed to get a db connection for module schema")?;
    for migration in kroma_module_kernel::module_migrations() {
        db::apply_migrations(&conn, migration).context("failed to apply module schema")?;
    }
    drop(conn);
    Ok(pool)
}
