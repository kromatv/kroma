//! Reading the library list the owner saved, and telling a list that cannot be
//! read from no list at all.

use serde_json::Value;

use super::{LibraryDef, Settings};

const LIBRARIES_KEY: &str = "libraries";

/// A library list is stored and does not read as one, so nobody knows which
/// libraries the owner configured. That is not "nothing stored": the
/// environment and the demo seed a list only when none was ever saved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UnreadableLibraryList;

impl std::fmt::Display for UnreadableLibraryList {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(
            "the stored library list cannot be read, so no library was changed; \
             save the `libraries` setting again as a list of libraries",
        )
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
    if settings.could_not_read(LIBRARIES_KEY) {
        return Err(UnreadableLibraryList);
    }
    library_list(&settings.get(LIBRARIES_KEY))
}

#[cfg(test)]
mod tests;
