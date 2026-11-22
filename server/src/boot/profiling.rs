//! Profiling: the statement hook goes in before the first database opens, the
//! history beside the database once the state exists.

use std::path::Path;
use std::time::Duration;

use kroma_engine::services::settings::{PROFILING_KEY, Settings};
use kroma_engine::state::SharedState;

const TICK: Duration = Duration::from_secs(30);

/// Traces every SQLite connection the process opens from here on, named the
/// way the reports show them: `core`, or the module a database belongs to.
pub fn install() {
    kroma_perf::name_databases(database_name);
    kroma_perf::install();
}

fn database_name(path: &Path) -> Option<String> {
    let Some(file) = path.file_name().and_then(|f| f.to_str()) else {
        return Some("memory".into());
    };
    let owner = path
        .parent()
        .and_then(Path::file_name)
        .and_then(|d| d.to_str());
    match (file, owner) {
        ("kroma.db", _) => Some("core".into()),
        ("module.sqlite", Some(id)) => Some(id.to_string()),
        _ => path
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned()),
    }
}

/// Applies the owner's choice, opens `<data>/perf.db` and rolls the buckets over
/// on a timer.
pub fn start(state: &SharedState) {
    let profiler = kroma_perf::profiler();
    profiler.set_enabled(wanted(&state.settings));
    let path = state.config.data_dir.join("perf.db");
    match kroma_perf::Store::open(&path, crate::BUILD) {
        Ok(store) => {
            keep_private(&path);
            profiler.attach(store);
        }
        Err(error) => {
            tracing::warn!(error = %format!("{error:#}"), "performance history is kept in memory only")
        }
    }
    tokio::spawn(async {
        let mut every = tokio::time::interval(TICK);
        loop {
            every.tick().await;
            kroma_perf::profiler().tick();
        }
    });
}

/// Whether profiling should run: the owner's setting, unless the environment
/// forbids it.
pub fn wanted(settings: &Settings) -> bool {
    allowed_by_env() && settings.get_bool(PROFILING_KEY, true)
}

/// `KROMA_PROFILING=off` (or `0`, `false`) keeps profiling off whatever the
/// setting says.
pub fn allowed_by_env() -> bool {
    !matches!(
        std::env::var("KROMA_PROFILING")
            .map(|v| v.trim().to_ascii_lowercase())
            .as_deref(),
        Ok("off" | "0" | "false" | "no")
    )
}

#[cfg(unix)]
fn keep_private(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn keep_private(_path: &Path) {}

#[cfg(test)]
mod tests {
    use super::database_name;
    use std::path::Path;

    #[test]
    fn the_core_database_and_a_module_database_get_their_names() {
        assert_eq!(
            database_name(Path::new("/data/kroma.db")).as_deref(),
            Some("core")
        );
        assert_eq!(
            database_name(Path::new(
                "/data/databases/tv.kroma.acquisition/module.sqlite"
            ))
            .as_deref(),
            Some("tv.kroma.acquisition")
        );
        assert_eq!(database_name(Path::new("")).as_deref(), Some("memory"));
    }
}
