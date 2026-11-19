//! What a walk has found so far: every library's titles, and one library's own
//! tally while its folders are read.

use std::collections::{HashMap, HashSet};

use crate::model::{Library, LibraryKind, MediaItem, Show};
use crate::services::settings::LibraryDef;

#[derive(Default)]
pub(super) struct Found {
    pub items: HashMap<String, MediaItem>,
    pub shows: HashMap<String, Show>,
    pub mtimes: HashMap<String, Option<i64>>,
}

pub(super) struct LibraryWalk<'a> {
    pub def: &'a LibraryDef,
    pub found: &'a mut Found,
    pub item_ids: HashSet<String>,
    pub movie_seen: bool,
    pub episode_seen: bool,
}

impl<'a> LibraryWalk<'a> {
    pub(super) fn new(def: &'a LibraryDef, found: &'a mut Found) -> Self {
        Self {
            def,
            found,
            item_ids: HashSet::new(),
            movie_seen: false,
            episode_seen: false,
        }
    }

    pub(super) fn library(&self) -> Library {
        let detected = match (self.movie_seen, self.episode_seen) {
            (false, true) => LibraryKind::Shows,
            (true, true) => LibraryKind::Mixed,
            _ => LibraryKind::Movies,
        };
        let kind = match self.def.kind.as_str() {
            "movies" => LibraryKind::Movies,
            "shows" => LibraryKind::Shows,
            "mixed" => LibraryKind::Mixed,
            _ => detected,
        };
        Library {
            id: self.def.id.clone(),
            name: self.def.name.clone(),
            kind,
            path: self.def.folders.join(", "),
            item_count: self.item_ids.len(),
        }
    }
}
