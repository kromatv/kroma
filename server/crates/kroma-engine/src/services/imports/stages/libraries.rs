//! The libraries the owner kept become sources. A library that has a source
//! here, new or one already over the same folders, answers `Brought` with that
//! source's id.
//!
//! A source is made only over a folder the owner confirmed, on this review
//! screen or on an earlier one. The other server's word for where a folder is
//! places nothing.

use std::path::Path;

use anyhow::Result;

use super::super::passage::logged;
use super::super::paths::{Translation, on_this_machine};
use super::{Importing, LibraryRow, Outcome};
use crate::db;
use crate::model::import::{Library, LibraryKind};
use crate::model::imports::KeptFolder;
use crate::services::jobs::JobKey;
use crate::services::settings::{self, LibraryDef};

const SCAN: JobKey = JobKey("library.scan");

pub(super) fn place(importing: &Importing<'_>, kept: &[LibraryRow<'_>]) -> Result<Vec<Outcome>> {
    let state = importing.state;
    let defs = settings::library_defs(&state.settings, &state.config)
        .map_err(|_| settings::unreadable_list_failure(&state.db))?;
    db::imports::keep_folders(&state.db, importing.server_id, &confirmed(kept))?;
    let translation = Translation::kept(&state.db, importing.server_id)?;
    let mut sources = Sources {
        defs,
        changed: false,
    };
    let outcomes = kept
        .iter()
        .map(|row| sources.take(row, placed_folders(row.library, &translation)))
        .collect();
    if sources.changed {
        settings::set_library_defs(&state.settings, &state.db, &sources.defs);
        let _ = state.jobs.trigger(state.clone(), SCAN, "import");
    }
    Ok(outcomes)
}

fn confirmed(kept: &[LibraryRow<'_>]) -> Vec<KeptFolder> {
    kept.iter()
        .flat_map(|row| &row.kept.folders)
        .filter(|answer| on_this_machine(&answer.here))
        .cloned()
        .collect()
}

fn placed_folders(library: &Library, translation: &Translation) -> Vec<String> {
    let mut here: Vec<String> = Vec::new();
    for folder in &library.folders {
        match translation.folder_here(folder) {
            Some(placed) if !here.contains(&placed) => here.push(placed),
            _ => {}
        }
    }
    here
}

fn kind_of(kind: LibraryKind) -> &'static str {
    match kind {
        LibraryKind::Movies => "movies",
        LibraryKind::Shows => "shows",
        LibraryKind::Mixed => "mixed",
        LibraryKind::Other => "",
    }
}

fn source_named(library: &Library, folders: Vec<String>) -> LibraryDef {
    let name = logged(&library.name, &library.id);
    LibraryDef {
        id: kroma_primitives::short_hash(&format!(
            "lib|{name}|{}",
            kroma_primitives::random_token()
        )),
        name,
        kind: kind_of(library.kind).to_string(),
        folders,
        auto_scan: true,
    }
}

struct Sources {
    defs: Vec<LibraryDef>,
    changed: bool,
}

impl Sources {
    fn holding(&self, folder: &str) -> Option<usize> {
        self.defs.iter().position(|def| {
            def.folders
                .iter()
                .any(|held| Path::new(folder).starts_with(held))
        })
    }

    fn take(&mut self, row: &LibraryRow<'_>, folders: Vec<String>) -> Outcome {
        if folders.is_empty() {
            return Outcome::Untouched;
        }
        let own = row
            .source
            .and_then(|id| self.defs.iter().position(|def| def.id == id));
        let home = own.or_else(|| folders.iter().find_map(|folder| self.holding(folder)));
        let free: Vec<String> = folders
            .into_iter()
            .filter(|folder| self.holding(folder).is_none())
            .collect();
        if own.is_some() && free.is_empty() {
            return Outcome::AlreadyHere;
        }
        self.changed |= !free.is_empty();
        let at = match home {
            Some(at) => {
                self.defs[at].folders.extend(free);
                at
            }
            None => {
                self.defs.push(source_named(row.library, free));
                self.defs.len() - 1
            }
        };
        Outcome::Brought {
            target: Some(self.defs[at].id.clone()),
        }
    }
}
