use std::collections::HashMap;

use kroma_testing::TempDir;

use super::*;
use crate::model::imports::{KeptFolder, Kind, Tally};
use crate::services::settings::{self, LibraryDef};

pub(super) fn this_machine(folders: &[&str]) -> TempDir {
    let root = kroma_testing::temp_dir("import-libraries");
    for folder in folders {
        std::fs::create_dir_all(root.path().join(folder)).unwrap();
    }
    root
}

pub(super) fn at(root: &TempDir, folder: &str) -> String {
    root.path().join(folder).to_string_lossy().into_owned()
}

pub(super) fn answered(library: &str, folders: &[(&str, &str)]) -> KeptLibrary {
    KeptLibrary {
        id: library.into(),
        folders: folders
            .iter()
            .map(|(folder, here)| KeptFolder {
                folder: (*folder).into(),
                here: (*here).into(),
            })
            .collect(),
    }
}

pub(super) fn review(libraries: Vec<KeptLibrary>) -> Selection {
    Selection {
        libraries,
        users: Vec::new(),
    }
}

pub(super) fn films_at(here: &str) -> Selection {
    review(vec![answered("1", &[("/data/movies", here)])])
}

pub(super) fn sources(state: &SharedState) -> Vec<(String, String, Vec<String>)> {
    settings::library_defs(&state.settings, &state.config)
        .unwrap()
        .into_iter()
        .map(|def| (def.name, def.kind, def.folders))
        .collect()
}

pub(super) fn source_ids(state: &SharedState) -> Vec<String> {
    settings::library_defs(&state.settings, &state.config)
        .unwrap()
        .into_iter()
        .map(|def| def.id)
        .collect()
}

pub(super) fn became(state: &SharedState) -> HashMap<String, String> {
    let server_id = db::imports::server_key(IMPORTER, "srv");
    db::imports::targets(&state.db, &server_id, Kind::Library).unwrap()
}

pub(super) fn libraries(read: u64, brought: u64) -> Tally {
    Tally {
        read,
        brought,
        unmatched: 0,
    }
}

pub(super) fn a_source(state: &SharedState, name: &str, folder: &str) -> String {
    let def = LibraryDef {
        id: format!("source-{name}"),
        name: name.into(),
        kind: "movies".into(),
        folders: vec![folder.into()],
        auto_scan: true,
    };
    settings::set_library_defs(&state.settings, &state.db, std::slice::from_ref(&def));
    def.id
}
