//! Which title of this server a title of the other server is. Its file
//! answers first, through the path translation. Failing that, the ids other
//! catalogues give it, then its name and year, or its series, season and
//! episode.
//!
//! A file is looked up under the path a scan writes for it, so a title whose
//! file is in a source and that no scan has reached yet is known as awaited
//! instead of being matched to another copy by its ids.

mod described;

use std::path::{Path, PathBuf};

use anyhow::Result;

use self::described::Described;
use super::super::paths::Translation;
use super::Importing;
use crate::db;
use crate::model::import::Title;
use crate::services::settings;
use crate::state::SharedState;

const MAX_PATHS_OF_A_TITLE: usize = 8;
const MAX_PATH_BYTES: usize = 4096;

/// What a title of the other server is on this server.
///
/// `Title` is the id of the catalogue item it is. `Awaited` is the path of a
/// file of the title on this machine, as a scan writes it: the file is in a
/// source and no title has it yet. `Nothing` matched neither.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Found {
    Title(String),
    Awaited(String),
    Nothing,
}

/// Finds each of `titles` on this server, and answers one [`Found`] per title
/// in the order given. It reads the catalogue and the disk, and writes
/// nothing.
pub(super) fn find(importing: &Importing<'_>, titles: &[&Title]) -> Result<Vec<Found>> {
    let pool = &importing.state.db;
    let translation = Translation::kept(pool, importing.server_id)?;
    let sources = Sources::of(importing.state);
    let files: Vec<Vec<String>> = titles
        .iter()
        .map(|title| sources.files_of(title, &translation))
        .collect();
    let paths: Vec<&str> = files.iter().flatten().map(String::as_str).collect();
    let scanned = db::imports::items_by_file(pool, &paths)?;
    let mut described = Described::on(pool);
    let mut found = Vec::with_capacity(titles.len());
    for (title, files) in titles.iter().zip(&files) {
        let by_file = files.iter().find_map(|file| scanned.get(file));
        found.push(match by_file {
            Some(item) => Found::Title(item.clone()),
            None => match files.iter().find(|file| Path::new(file).is_file()) {
                Some(file) => Found::Awaited(file.clone()),
                None => described.find(title)?.map_or(Found::Nothing, Found::Title),
            },
        });
    }
    Ok(found)
}

struct Sources {
    roots: Vec<(PathBuf, PathBuf)>,
}

impl Sources {
    fn of(state: &SharedState) -> Self {
        let roots = settings::all_folders(&state.settings, &state.config)
            .into_iter()
            .map(|root| {
                let resolved = root.canonicalize().unwrap_or_else(|_| root.clone());
                (root, resolved)
            })
            .collect();
        Self { roots }
    }

    fn as_scanned(&self, here: &str) -> Option<String> {
        let here = Path::new(here);
        self.roots.iter().find_map(|(root, resolved)| {
            let below = here
                .strip_prefix(root)
                .or_else(|_| here.strip_prefix(resolved))
                .ok()?;
            Some(resolved.join(below).to_string_lossy().into_owned())
        })
    }

    fn files_of(&self, title: &Title, translation: &Translation) -> Vec<String> {
        title
            .paths
            .iter()
            .take(MAX_PATHS_OF_A_TITLE)
            .filter(|path| path.len() <= MAX_PATH_BYTES)
            .filter_map(|path| self.as_scanned(&translation.here(path)?))
            .collect()
    }
}
