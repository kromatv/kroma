//! The backups the server saves by itself, on the `backup.save` job's
//! schedule: one export into a folder, keeping the newest few.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow};
use serde::Serialize;

use crate::services::folders::{self, FolderRefusal};
use crate::services::settings::Settings;
use crate::state::SharedState;

/// The switch that turns scheduled backups on. Off on a new server.
pub const ENABLED_KEY: &str = "backupAuto";
/// The folder the owner chose. Empty is the data folder's own `backups`.
pub const FOLDER_KEY: &str = "backupFolder";
/// How many scheduled backups the folder keeps.
pub const KEEP_KEY: &str = "backupKeep";
/// Seven: a week of nightly backups.
pub const DEFAULT_KEEP: u32 = 7;
/// The most backups a folder keeps.
pub const MAX_KEEP: u32 = 365;

const PREFIX: &str = "kroma-scheduled-";
const EXTENSION: &str = "kroma";
const DEFAULT_FOLDER: &str = "backups";

/// How the scheduled backups stand.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub enabled: bool,
    pub folder: String,
    pub chosen: bool,
    pub keep: u32,
}

/// What one scheduled run saved, and the older backups it removed.
#[derive(Debug)]
pub struct Saved {
    pub file: PathBuf,
    pub bytes: usize,
    pub removed: usize,
}

/// The folder backups go to while the owner chose none.
pub fn default_folder(data_dir: &Path) -> PathBuf {
    data_dir.join(DEFAULT_FOLDER)
}

fn kept(settings: &Settings) -> u32 {
    let asked = settings.get_i64(KEEP_KEY, i64::from(DEFAULT_KEEP));
    u32::try_from(asked.clamp(1, i64::from(MAX_KEEP))).unwrap_or(DEFAULT_KEEP)
}

/// The schedule the settings hold.
pub fn schedule(settings: &Settings, data_dir: &Path) -> Schedule {
    let chosen = settings.get_str(FOLDER_KEY, "").trim().to_string();
    let folder = if chosen.is_empty() {
        default_folder(data_dir).to_string_lossy().into_owned()
    } else {
        chosen.clone()
    };
    Schedule {
        enabled: settings.get_bool(ENABLED_KEY, false),
        folder,
        chosen: !chosen.is_empty(),
        keep: kept(settings),
    }
}

fn refusal(folder: &str, why: FolderRefusal) -> anyhow::Error {
    match why {
        FolderRefusal::Outside => anyhow!("{folder} is outside the folders this server may use"),
        FolderRefusal::Missing => anyhow!("{folder} is not there, or is not a folder"),
    }
}

fn target(plan: &Schedule) -> Result<PathBuf> {
    if plan.chosen {
        return folders::picked_folder(&plan.folder).map_err(|why| refusal(&plan.folder, why));
    }
    let folder = PathBuf::from(&plan.folder);
    std::fs::create_dir_all(&folder)
        .with_context(|| format!("could not create {}", folder.display()))?;
    Ok(folder)
}

#[cfg(unix)]
fn owner_only(file: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(file, std::fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn owner_only(_file: &Path) -> Result<()> {
    Ok(())
}

fn write(file: &Path, bytes: &[u8]) -> Result<()> {
    let part = file.with_extension("part");
    std::fs::write(&part, bytes).with_context(|| format!("could not write {}", part.display()))?;
    owner_only(&part)?;
    std::fs::rename(&part, file).with_context(|| format!("could not write {}", file.display()))?;
    Ok(())
}

fn scheduled(path: &Path) -> bool {
    let named = path.file_name().and_then(OsStr::to_str);
    let ours = named.is_some_and(|name| name.starts_with(PREFIX));
    ours && path.extension().and_then(OsStr::to_str) == Some(EXTENSION)
}

/// The scheduled backups in `folder`, the newest first. A file of any other
/// name is never one, so a backup the owner put there by hand stays.
pub fn saved_in(folder: &Path) -> Result<Vec<PathBuf>> {
    let mut saved: Vec<PathBuf> = std::fs::read_dir(folder)?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| scheduled(path))
        .collect();
    saved.sort_unstable_by(|a, b| b.cmp(a));
    Ok(saved)
}

fn prune(folder: &Path, keep: u32) -> Result<usize> {
    let old: Vec<PathBuf> = saved_in(folder)?.into_iter().skip(keep as usize).collect();
    for file in &old {
        std::fs::remove_file(file)
            .with_context(|| format!("could not remove {}", file.display()))?;
    }
    Ok(old.len())
}

/// Saves one backup, named after `stamp`, into the scheduled folder, then
/// removes the oldest past the number kept. A folder the owner chose is
/// checked as the folder picker checks it, at every run.
pub fn save(state: &SharedState, stamp: &str) -> Result<Saved> {
    let plan = schedule(&state.settings, &state.config.data_dir);
    let folder = target(&plan)?;
    let bytes = super::export(&state.db, &state.config.data_dir, None)?;
    let file = folder.join(format!("{PREFIX}{stamp}.{EXTENSION}"));
    write(&file, &bytes)?;
    let removed = prune(&folder, plan.keep)?;
    Ok(Saved {
        file,
        bytes: bytes.len(),
        removed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::test_state;

    fn backing_up_to(state: &SharedState, folder: &Path, keep: u32) {
        state.settings.set_patch(
            &state.db,
            [
                (ENABLED_KEY.to_string(), serde_json::json!(true)),
                (
                    FOLDER_KEY.to_string(),
                    serde_json::json!(folder.to_string_lossy()),
                ),
                (KEEP_KEY.to_string(), serde_json::json!(keep)),
            ]
            .into(),
        );
    }

    fn names(folder: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(folder)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_new_server_saves_nothing_by_itself_and_would_keep_seven() {
        let state = test_state();

        let plan = schedule(&state.settings, &state.config.data_dir);

        assert_eq!((plan.enabled, plan.chosen, plan.keep), (false, false, 7));
    }

    #[test]
    fn with_no_folder_chosen_the_backups_go_into_the_data_folder() {
        let state = test_state();
        state.settings.set_patch(
            &state.db,
            [(ENABLED_KEY.to_string(), serde_json::json!(true))].into(),
        );

        save(&state, "2026-11-21T03-00-00Z").unwrap();

        let folder = default_folder(&state.config.data_dir);
        assert_eq!(saved_in(&folder).unwrap().len(), 1);
    }

    #[test]
    fn only_the_newest_backups_are_kept() {
        let state = test_state();
        let folder = kroma_testing::temp_dir("schedule");
        backing_up_to(&state, folder.path(), 2);

        for night in ["19", "20", "21"] {
            save(&state, &format!("2026-11-{night}T03-00-00Z")).unwrap();
        }

        assert_eq!(
            names(folder.path()),
            [
                "kroma-scheduled-2026-11-20T03-00-00Z.kroma",
                "kroma-scheduled-2026-11-21T03-00-00Z.kroma"
            ]
        );
    }

    #[test]
    fn a_backup_the_owner_put_in_the_folder_is_never_removed() {
        let state = test_state();
        let folder = kroma_testing::temp_dir("schedule");
        std::fs::write(folder.path().join("kroma-backup-by-hand.kroma"), "x").unwrap();
        backing_up_to(&state, folder.path(), 1);

        save(&state, "2026-11-21T03-00-00Z").unwrap();

        assert!(folder.path().join("kroma-backup-by-hand.kroma").exists());
    }

    #[test]
    fn a_saved_backup_restores() {
        let state = test_state();
        let folder = kroma_testing::temp_dir("schedule");
        backing_up_to(&state, folder.path(), 7);

        let saved = save(&state, "2026-11-21T03-00-00Z").unwrap();

        let bytes = std::fs::read(&saved.file).unwrap();
        let target = test_state();
        assert!(
            super::super::import(&target.db, &target.config.data_dir, &bytes, None, false).is_ok()
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_saved_backup_is_readable_by_the_server_alone() {
        use std::os::unix::fs::PermissionsExt;
        let state = test_state();
        let folder = kroma_testing::temp_dir("schedule");
        backing_up_to(&state, folder.path(), 7);

        let saved = save(&state, "2026-11-21T03-00-00Z").unwrap();

        let mode = std::fs::metadata(&saved.file).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn a_count_out_of_range_is_held_to_the_range() {
        let state = test_state();
        state.settings.set_patch(
            &state.db,
            [(KEEP_KEY.to_string(), serde_json::json!(0))].into(),
        );

        let plan = schedule(&state.settings, &state.config.data_dir);

        assert_eq!(plan.keep, 1);
    }
}
