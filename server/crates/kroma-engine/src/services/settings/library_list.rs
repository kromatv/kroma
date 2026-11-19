//! Reading the library list the owner saved, and telling a list that cannot be
//! read from no list at all.

use serde_json::Value;

use crate::db::Pool;

use super::{LibraryDef, Settings};

pub(super) const LIBRARIES_KEY: &str = "libraries";

/// A library list is stored and does not read as one, so nobody knows which
/// libraries the owner configured. That is not "nothing stored": the
/// environment and the demo seed a list only when none was ever saved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UnreadableLibraryList;

impl std::fmt::Display for UnreadableLibraryList {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("the saved library list cannot be read")
    }
}

impl std::error::Error for UnreadableLibraryList {}

/// One `libraries` value as a list: `None` for null, which is nothing stored.
pub fn library_list(value: &Value) -> Result<Option<Vec<LibraryDef>>, UnreadableLibraryList> {
    if value.is_null() {
        return Ok(None);
    }
    serde_json::from_value(value.clone())
        .map(Some)
        .map_err(|_| UnreadableLibraryList)
}

/// The list the owner saved, `None` when none was ever saved.
pub fn stored_library_defs(
    settings: &Settings,
) -> Result<Option<Vec<LibraryDef>>, UnreadableLibraryList> {
    let saved = settings
        .stored(LIBRARIES_KEY)
        .ok_or(UnreadableLibraryList)?;
    library_list(&saved)
}

/// Saves the list for the code that owns it: the library handlers and an
/// import, which start from the list they read and add, edit or delete one
/// library. It is the one writer that may leave a library out, because deleting
/// a library is that. Every other write of `libraries` goes through the store,
/// which refuses a list that leaves out a library the index holds.
pub fn set_library_defs(settings: &Settings, pool: &Pool, defs: &[LibraryDef]) {
    settings.save_library_list(pool, serde_json::json!(defs));
}

#[cfg(test)]
mod tests;
