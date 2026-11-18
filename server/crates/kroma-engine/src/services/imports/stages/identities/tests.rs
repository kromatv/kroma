mod keeping;
mod matching;

use kroma_testing::TempDir;
use serde_json::{Value, json};

use super::*;
use crate::db::imports::NewImport;
use crate::model::import::Library;
use crate::model::imports::{Import, KeptFolder, Origin, Selection};
use crate::services::settings::{self, LibraryDef};
use crate::state::SharedState;
use crate::test_support::test_state_with_tmdb;

const IMPORTER: &str = "tv.x.import";
const FILED_AS_RONIN: &str = "Ronin (1998)/Ronin (1998).mkv";
const FILED_AS_THE_SHIELD: &str = "The Shield/The Shield S01E01.mkv";

struct Household {
    state: SharedState,
    import: Import,
    server_id: String,
    disk: TempDir,
}

fn queued(state: &SharedState) -> Import {
    let server = Origin {
        id: "srv".into(),
        name: "Living room".into(),
    };
    let new = NewImport {
        id: "i1",
        importer: IMPORTER,
        server: &server,
        sign_in: "s-1",
        selection: &Selection::default(),
        started_by: None,
        created_ms: 1,
    };
    assert!(db::imports::queue(&state.db, &new).unwrap());
    db::imports::get(&state.db, "i1").unwrap().unwrap()
}

fn household() -> Household {
    let state = test_state_with_tmdb("key");
    let disk = kroma_testing::temp_dir("import-identities");
    let import = queued(&state);
    let server_id = db::imports::server_key(IMPORTER, "srv");
    let mut answered = Vec::new();
    let mut sources = Vec::new();
    for (name, kind) in [("movies", "movies"), ("shows", "shows")] {
        let here = disk.path().join(name);
        std::fs::create_dir_all(&here).unwrap();
        let here = here.to_string_lossy().into_owned();
        answered.push(KeptFolder {
            folder: format!("/data/{name}"),
            here: here.clone(),
        });
        sources.push(LibraryDef {
            id: name.into(),
            name: name.into(),
            kind: kind.into(),
            folders: vec![here],
            auto_scan: true,
        });
    }
    db::imports::keep_folders(&state.db, &server_id, &answered).unwrap();
    settings::set_library_defs(&state.settings, &state.db, &sources);
    Household {
        state,
        import,
        server_id,
        disk,
    }
}

fn title(described: Value) -> Title {
    serde_json::from_value(described).unwrap()
}

fn heat_filed_as_ronin(ids: Value) -> Title {
    title(json!({
        "id": "t1",
        "kind": "movie",
        "title": "Heat",
        "year": 1995,
        "paths": [format!("/data/movies/{FILED_AS_RONIN}")],
        "ids": ids,
    }))
}

fn the_wire_filed_as_the_shield(show_ids: Value) -> Title {
    title(json!({
        "id": "t2",
        "kind": "episode",
        "title": "The Target",
        "season": 1,
        "episode": 1,
        "paths": [format!("/data/shows/{FILED_AS_THE_SHIELD}")],
        "series": { "title": "The Wire", "ids": show_ids },
    }))
}

impl Household {
    fn here(&self, file: &str) -> String {
        let folder = self.disk.path().canonicalize().unwrap();
        folder.join(file).to_string_lossy().into_owned()
    }

    fn offer(&self, titles: &[Title]) -> Vec<Outcome> {
        let films = json!({ "id": "1", "name": "Films", "kind": "movies" });
        let library: Library = serde_json::from_value(films).unwrap();
        let rows: Vec<&Title> = titles.iter().collect();
        let page = TitlePage {
            library: &library,
            source: Some("movies"),
            titles: &rows,
        };
        let importing = Importing {
            state: &self.state,
            import: &self.import,
            server_id: &self.server_id,
        };
        keep(&importing, &page).unwrap()
    }

    fn kept(&self) -> Vec<String> {
        let conn = self.state.db.get().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT abs_path || '|' || subject || '|' || COALESCE(tmdb_id, '') || '|' \
                 || COALESCE(imdb_id, '') || '|' || COALESCE(tvdb_id, '') \
                 FROM import_identities ORDER BY 1",
            )
            .unwrap();
        let rows = stmt.query_map([], |r| r.get(0)).unwrap();
        rows.map(Result::unwrap).collect()
    }
}
