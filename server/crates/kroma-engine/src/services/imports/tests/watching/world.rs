use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use kroma_testing::TempDir;

use super::super::super::stages::{Core, UserRow};
use super::super::this_machine::{at, this_machine};
use super::super::*;
use crate::model::imports::KeptFolder;
use crate::services::scan::rescan_sync;
use crate::services::settings::{self, LibraryDef};

pub(super) const LAST_WEEK: i64 = 1_700_000_000;
pub(super) const A_DAY: i64 = 86_400;
pub(super) const LAST_WEEK_STAMP: &str = "2023-11-14T22:13:20Z";
pub(super) const HEAT: &str = "films/Heat (1995)/Heat (1995).mkv";
pub(super) const RONIN: &str = "films/Ronin (1998)/Ronin (1998).mkv";

pub(super) struct Merging {
    pub(super) others: Recording,
    pub(super) accounts: HashMap<&'static str, String>,
    pub(super) folders: Vec<KeptFolder>,
    pub(super) stops_after_the_states: AtomicBool,
}

impl Stages for Merging {
    fn libraries(
        &self,
        importing: &Importing<'_>,
        kept: &[LibraryRow<'_>],
    ) -> Result<Vec<Outcome>> {
        db::imports::keep_folders(&importing.state.db, importing.server_id, &self.folders)?;
        self.others.libraries(importing, kept)
    }

    fn users(&self, _: &Importing<'_>, kept: &UserRows<'_>) -> Result<Vec<Outcome>> {
        let account_of = |row: &UserRow<'_>| {
            let account = self.accounts.get(row.user.id.as_str());
            account.map_or(Outcome::Untouched, |id| Outcome::Brought {
                target: Some(id.clone()),
            })
        };
        Ok(kept.rows.iter().map(account_of).collect())
    }

    fn titles(&self, importing: &Importing<'_>, page: &TitlePage<'_>) -> Result<Vec<Outcome>> {
        self.others.titles(importing, page)
    }

    fn states(&self, importing: &Importing<'_>, page: &StatePage<'_>) -> Result<Vec<Outcome>> {
        let outcomes = Core.states(importing, page)?;
        if self.stops_after_the_states.swap(false, Ordering::SeqCst) {
            anyhow::bail!("the run stopped before the job recorded the states");
        }
        Ok(outcomes)
    }

    fn plays(&self, importing: &Importing<'_>, page: &[PlayRow<'_>]) -> Result<Vec<Outcome>> {
        self.others.plays(importing, page)
    }
}

pub(super) struct World {
    pub(super) disk: TempDir,
    pub(super) server: OtherServer,
    pub(super) state: SharedState,
    pub(super) stages: Merging,
    pub(super) ana: String,
}

pub(super) fn film_at(id: &str, name: &str, year: u32) -> Value {
    json!({
        "id": id,
        "kind": "movie",
        "title": name,
        "year": year,
        "paths": [format!("/data/movies/{name} ({year})/{name} ({year}).mkv")],
    })
}

pub(super) fn heat_and_ronin() -> Vec<(&'static str, Value)> {
    vec![
        ("1", film_at("t1", "Heat", 1995)),
        ("1", film_at("t2", "Ronin", 1998)),
    ]
}

pub(super) fn stopped(title: &str, position_ms: u64, at: i64) -> Value {
    json!({
        "title": title,
        "positionMs": position_ms,
        "durationMs": 10_200_000,
        "lastPlayedAt": at,
    })
}

pub(super) fn of_ana(states: Vec<Value>) -> Vec<((&'static str, &'static str), Value)> {
    states.into_iter().map(|state| (("42", "1"), state)).collect()
}

fn a_source(disk: &TempDir, folder: &str, kind: &str) -> LibraryDef {
    LibraryDef {
        id: format!("source-{folder}"),
        name: folder.into(),
        kind: kind.into(),
        folders: vec![at(disk, folder)],
        auto_scan: true,
    }
}

pub(super) fn folder(disk: &TempDir, there: &str, here: &str) -> KeptFolder {
    KeptFolder {
        folder: there.into(),
        here: at(disk, here),
    }
}

pub(super) fn a_household_that_holds(
    titles: Vec<(&'static str, Value)>,
    states: Vec<((&'static str, &'static str), Value)>,
) -> World {
    let disk = this_machine(&["films", "shows"]);
    let server = household();
    server.change(|household| {
        household.titles = titles;
        household.states = states;
        household.plays = Vec::new();
    });
    let state = importing_from(&server);
    let sources = [
        a_source(&disk, "films", "movies"),
        a_source(&disk, "shows", "shows"),
    ];
    settings::set_library_defs(&state.settings, &state.db, &sources);
    let ana = db::create_user(&state.db, "ana@example.test", "ana", "", &[]).unwrap();
    let stages = Merging {
        others: Recording::default(),
        accounts: HashMap::from([("42", ana.id.clone())]),
        folders: vec![
            folder(&disk, "/data/movies", "films"),
            folder(&disk, "/data/shows", "shows"),
        ],
        stops_after_the_states: AtomicBool::new(false),
    };
    World {
        disk,
        server,
        state,
        stages,
        ana: ana.id,
    }
}

impl World {
    pub(super) fn has_the_file(&self, file: &str) {
        let path = self.disk.path().join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"x").unwrap();
    }

    pub(super) fn scans(&self) {
        rescan_sync(&self.state).unwrap();
    }

    pub(super) fn has_scanned(&self, files: &[&str]) {
        for file in files {
            self.has_the_file(file);
        }
        self.scans();
    }

    pub(super) fn title_of(&self, file: &str) -> String {
        let name = file.rsplit('/').next().unwrap();
        self.state
            .db
            .get()
            .unwrap()
            .query_row(
                "SELECT item_id FROM files WHERE abs_path LIKE '%/' || ?1",
                [name],
                |r| r.get(0),
            )
            .unwrap()
    }

    pub(super) fn imports(&self) -> Ran {
        import(&self.state, &self.stages, &kept(&["1", "2"], &["42", "43"]))
    }

    pub(super) fn resume_point(&self, file: &str) -> Option<(i64, String)> {
        let saved = db::get_progress(&self.state.db, &self.ana, &self.title_of(file)).unwrap();
        saved.map(|saved| (saved.position_ms, saved.updated_at))
    }

    pub(super) fn watch_state(&self) -> Vec<String> {
        lines(
            &self.state,
            "SELECT 'resume|' || user_id || '|' || item_id || '|' || position_ms || '|' || updated_at \
               FROM progress \
             UNION ALL SELECT 'watched|' || user_id || '|' || item_id || '|' || watched_at FROM watched \
             UNION ALL SELECT 'listed|' || user_id || '|' || item_id || '|' || added_at FROM my_list \
             UNION ALL SELECT 'held|' || user_id || '|' || abs_path || '|' || COALESCE(position_ms, '') \
               FROM import_held_states \
             ORDER BY 1",
        )
    }
}
