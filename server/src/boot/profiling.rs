//! Profiling: the statement hook goes in before the first database opens, the
//! history beside the database once the state exists.

use std::path::Path;
use std::time::Duration;

use kroma_engine::services::settings::Settings;
use kroma_engine::state::SharedState;

/// Whether the server measures its requests, jobs and statements. On unless
/// the owner switched it off; `KROMA_PROFILING=off` overrides it.
pub const PROFILING_KEY: &str = "performanceProfiling";

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
    if let Some(store) = open_store(&state.config.data_dir.join("perf.db")) {
        profiler.attach(store);
    }
    tokio::spawn(roll_over());
}

fn open_store(path: &Path) -> Option<kroma_perf::Store> {
    let store = kroma_perf::Store::open(path, crate::BUILD)
        .inspect_err(|error| {
            tracing::warn!(error = %format!("{error:#}"), "performance history is kept in memory only");
        })
        .ok()?;
    keep_private(path);
    Some(store)
}

async fn roll_over() {
    let mut every = tokio::time::interval(TICK);
    loop {
        every.tick().await;
        let _ = tokio::task::spawn_blocking(|| kroma_perf::profiler().tick()).await;
    }
}

/// Whether profiling should run: the owner's setting, unless the environment
/// forbids it.
pub fn wanted(settings: &Settings) -> bool {
    allowed_by_env() && settings.get_bool(PROFILING_KEY, true)
}

/// `KROMA_PROFILING=off` (or `0`, `false`, `no`) keeps profiling off whatever
/// the setting says.
pub fn allowed_by_env() -> bool {
    allowed(std::env::var("KROMA_PROFILING").ok().as_deref())
}

fn allowed(value: Option<&str>) -> bool {
    let value = value.map(|v| v.trim().to_ascii_lowercase());
    !matches!(value.as_deref(), Some("off" | "0" | "false" | "no"))
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
    use super::{allowed, database_name, open_store};
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

    #[test]
    fn the_environment_turns_profiling_off_only_when_it_says_so() {
        assert!(allowed(None));
        assert!(allowed(Some("on")));
        assert!(!allowed(Some(" OFF ")));
        assert!(!allowed(Some("0")));
    }

    #[cfg(unix)]
    #[test]
    fn the_history_file_is_readable_by_the_server_alone() {
        use std::os::unix::fs::PermissionsExt;
        let dir = kroma_testing::temp_dir("perf-boot-store");
        let path = dir.path().join("perf.db");

        let store = open_store(&path);

        assert!(store.is_some());
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn a_history_that_cannot_open_is_kept_in_memory() {
        let dir = kroma_testing::temp_dir("perf-boot-missing");

        let store = open_store(&dir.path().join("missing").join("perf.db"));

        assert!(store.is_none());
    }
}
