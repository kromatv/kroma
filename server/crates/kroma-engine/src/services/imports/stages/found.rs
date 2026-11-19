//! Which title of this server a title of the other server is. Its file
//! answers first, through the path translation. Failing that, the ids other
//! catalogues give it, then its name and year, or its series, season and
//! episode.
//!
//! A file is looked up under the path a scan writes for it. A title whose
//! file is in a source, is one a scan writes and that no scan has reached yet
//! is known as awaited instead of being matched to another copy by its ids. A
//! file no scan writes waits for nothing: its title is looked for by its ids
//! and its name like any other.

mod described;
mod on_disk;

use anyhow::Result;

use self::described::Described;
use self::on_disk::{Placed, Sources};
use super::super::paths::Translation;
use super::Importing;
use crate::db;
use crate::model::import::Title;

/// What a title of the other server is on this server.
///
/// `Title` is the id of the catalogue item it is. `Awaited` is the path of a
/// file of the title on this machine, as a scan writes it: the file is in a
/// source, a scan writes such a file, and no title has it yet. `Nothing`
/// matched neither.
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
    let files: Vec<Vec<Placed>> = titles
        .iter()
        .map(|title| sources.files_of(title, &translation))
        .collect();
    let paths: Vec<&str> = files.iter().flatten().map(|file| &*file.path).collect();
    let scanned = db::imports::items_by_file(pool, &paths)?;
    let mut described = Described::on(pool);
    let mut found = Vec::with_capacity(titles.len());
    for (title, files) in titles.iter().zip(&files) {
        let by_file = match files.iter().find_map(|file| scanned.get(&file.path)) {
            Some(item) => Some(Found::Title(item.clone())),
            None => on_disk(pool, &sources, files)?,
        };
        found.push(match by_file {
            Some(by_file) => by_file,
            None => described.find(title)?.map_or(Found::Nothing, Found::Title),
        });
    }
    Ok(found)
}

fn on_disk(pool: &db::Pool, sources: &Sources, files: &[Placed]) -> Result<Option<Found>> {
    for file in files.iter().filter(|file| file.is_a_file()) {
        let Some(listed) = sources.as_listed(file) else {
            continue;
        };
        if listed.path != file.path {
            let mut scanned = db::imports::items_by_file(pool, &[&listed.path])?;
            if let Some(item) = scanned.remove(&listed.path) {
                return Ok(Some(Found::Title(item)));
            }
        }
        if listed.is_scanned() {
            return Ok(Some(Found::Awaited(listed.path)));
        }
    }
    Ok(None)
}
