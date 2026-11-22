//! The library list a restore leaves on this server. A restore that is not a
//! reset adds the backup's libraries to this server's and removes none; a
//! reset puts the backup's list in place of this server's, and says first
//! which libraries that removes.

use serde_json::{json, Value};

use super::ImportError;
use crate::db::{BackupDoc, Pool};
use crate::services::settings::{
    self, is_demo_library, library_sharing_files, HeldLibrary, LibraryDef, Refusal,
    UnreadableLibraryList,
};

const LIBRARIES_KEY: &str = "libraries";

/// How a restore treats this server's libraries. With `reset`, the backup's
/// list replaces this server's, and `seed` does when the backup saved none.
/// Without it, the backup's libraries join `now`, this server's list, which is
/// `Err` when the saved one cannot be read.
pub struct Plan {
    pub reset: bool,
    pub now: Result<Vec<LibraryDef>, UnreadableLibraryList>,
    pub seed: Vec<LibraryDef>,
}

impl Plan {
    /// The plan for this server as its settings and environment stand.
    pub fn for_server(
        settings: &settings::Settings,
        config: &crate::config::Config,
        reset: bool,
    ) -> Self {
        Plan {
            reset,
            now: settings::library_defs(settings, config),
            seed: settings::seeded_library_defs(config),
        }
    }
}

/// The list this server holds once `doc` is restored under `plan`. `None`
/// when the restore leaves this server's list as it is.
pub(super) fn restored_list(
    doc: &BackupDoc,
    plan: &Plan,
) -> Result<Option<Vec<LibraryDef>>, ImportError> {
    let backed_up = backed_up_list(doc)?;
    if plan.reset {
        return Ok(Some(backed_up.unwrap_or_else(|| plan.seed.clone())));
    }
    let Some(backed_up) = backed_up else {
        return Ok(None);
    };
    let now = plan
        .now
        .clone()
        .map_err(|_| ImportError::LibraryListUnreadable)?;
    Ok(Some(joined(now, backed_up)))
}

fn backed_up_list(doc: &BackupDoc) -> Result<Option<Vec<LibraryDef>>, ImportError> {
    let Some(row) = libraries_row(doc) else {
        return Ok(None);
    };
    let value = row
        .get("value")
        .and_then(Value::as_str)
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
        .ok_or_else(unreadable_backup_list)?;
    settings::library_list(&value).map_err(|_| unreadable_backup_list())
}

fn unreadable_backup_list() -> ImportError {
    ImportError::Invalid(anyhow::anyhow!("the backup's library list cannot be read"))
}

fn libraries_row(doc: &BackupDoc) -> Option<&serde_json::Map<String, Value>> {
    doc.tables
        .get("settings")?
        .iter()
        .find(|row| row.get("key").and_then(Value::as_str) == Some(LIBRARIES_KEY))
}

fn joined(now: Vec<LibraryDef>, backed_up: Vec<LibraryDef>) -> Vec<LibraryDef> {
    let mut list: Vec<LibraryDef> = now
        .into_iter()
        .filter(|def| !is_demo_library(&def.id))
        .collect();
    for def in backed_up {
        let known = list.iter().any(|held| held.id == def.id);
        let shared = library_sharing_files(&list, &def.folders, None).is_some();
        if !known && !shared && !is_demo_library(&def.id) {
            list.push(def);
        }
    }
    list
}

/// Writes `list` as the library list `doc` restores.
pub(super) fn restore_list(doc: &mut BackupDoc, list: &[LibraryDef]) {
    let rows = doc.tables.get_mut("settings").into_iter().flatten();
    for row in rows {
        if row.get("key").and_then(Value::as_str) == Some(LIBRARIES_KEY) {
            row.insert("value".into(), Value::String(json!(list).to_string()));
        }
    }
}

/// The libraries of this server the index holds and `list` leaves out: the
/// next scan removes them.
pub(super) fn removed(
    pool: &Pool,
    list: Option<&[LibraryDef]>,
) -> Result<Vec<HeldLibrary>, ImportError> {
    let Some(list) = list else {
        return Ok(Vec::new());
    };
    match settings::refusal(pool, &json!(list)).map_err(ImportError::Db)? {
        Some(Refusal::LeavesOut(left_out)) => Ok(left_out),
        Some(Refusal::NotAList) | None => Ok(Vec::new()),
    }
}

#[cfg(test)]
mod tests;
