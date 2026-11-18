//! The folders of a review screen: where this server says each one is before
//! the owner confirms it, and the check of what the owner sends back.

use std::path::Path;

use anyhow::Result;

use super::paths::{Translation, under_its_own_name};
use crate::db;
use crate::model::imports::KeptLibrary;
use crate::state::SharedState;

const MAX_PATH_BYTES: usize = 4096;

/// The folders of one other server a review screen is about to show, by the
/// importer that reads that server and the importer's id for it.
pub struct FoldersAsk {
    pub importer: String,
    pub server: String,
    pub folders: Vec<String>,
}

/// Where each folder asked about is on this machine, in the order asked: where
/// an earlier import kept it, else under its own name when this machine has
/// that folder. `None` is a folder the owner has to be asked for.
pub fn folders_here(state: &SharedState, ask: &FoldersAsk) -> Result<Vec<Option<String>>> {
    let server_id = db::imports::server_key(&ask.importer, &ask.server);
    let translation = Translation::kept(&state.db, &server_id)?;
    Ok(ask
        .folders
        .iter()
        .map(|folder| {
            translation
                .folder_here(folder)
                .or_else(|| under_its_own_name(folder))
        })
        .collect())
}

fn bounded(what: &str, path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err(format!("an empty {what}"));
    }
    if path.len() > MAX_PATH_BYTES {
        return Err(format!("a {what} past {MAX_PATH_BYTES} bytes"));
    }
    Ok(())
}

/// Says what is wrong with the first answer no review screen gives: a folder
/// with no name, one past the length a path has, or one placed on a path of
/// this machine that is not absolute.
pub(super) fn confirmable(libraries: &[KeptLibrary]) -> Result<(), String> {
    for answer in libraries.iter().flat_map(|kept| &kept.folders) {
        bounded("folder", &answer.folder)?;
        bounded("folder of this machine", &answer.here)?;
        if !Path::new(&answer.here).is_absolute() {
            return Err("a folder of this machine that is not an absolute path".to_string());
        }
    }
    Ok(())
}
