//! The title the other server says each file is, kept for matching to take
//! ahead of its own reading of the file's name. A title one of whose files
//! gets an identity answers `Brought`. One whose files all have the same
//! identity already answers `AlreadyHere`.
//!
//! An identity is kept under the path the scan records for its file, whether
//! the scan has reached that file or not. A title with no file under a folder
//! the owner confirmed, or with no id a catalogue knows it by, is left.

mod described;

use anyhow::Result;

use self::described::{known_as, storable};
use super::super::scan_paths::ScanPaths;
use super::{Importing, Outcome, TitlePage};
use crate::db;
use crate::db::imports::FileIdentity;
use crate::model::import::Title;

pub(super) fn keep(importing: &Importing<'_>, page: &TitlePage<'_>) -> Result<Vec<Outcome>> {
    let state = importing.state;
    let paths = ScanPaths::kept(state, importing.server_id)?;
    let files: Vec<Vec<FileIdentity>> = page
        .titles
        .iter()
        .map(|title| files_of(title, &paths))
        .collect();
    let files_per_title: Vec<usize> = files.iter().map(Vec::len).collect();
    let offered: Vec<FileIdentity> = files.into_iter().flatten().collect();
    let mut written =
        db::imports::keep_identities(&state.db, importing.server_id, &offered)?.into_iter();
    Ok(files_per_title
        .into_iter()
        .map(|files| outcome(written.by_ref().take(files)))
        .collect())
}

fn files_of(title: &Title, paths: &ScanPaths) -> Vec<FileIdentity> {
    let Some((subject, ids)) = known_as(title) else {
        return Vec::new();
    };
    let mut here: Vec<String> = Vec::new();
    for path in title.paths.iter().filter_map(|path| paths.of(path)) {
        if !here.contains(&path) {
            here.extend(storable(path));
        }
    }
    here.into_iter()
        .map(|path| FileIdentity {
            path,
            subject,
            ids: ids.clone(),
        })
        .collect()
}

fn outcome(written: impl Iterator<Item = bool>) -> Outcome {
    let written: Vec<bool> = written.collect();
    if written.is_empty() {
        Outcome::Untouched
    } else if written.contains(&true) {
        Outcome::Brought { target: None }
    } else {
        Outcome::AlreadyHere
    }
}

#[cfg(test)]
mod tests;
