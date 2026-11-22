mod cancelling;
mod confirming;
mod failing;
mod identifying;
mod other_server;
mod people;
mod placing;
mod reading;
mod recording;
mod reporting;
mod running_again;
mod scanning;
mod sharing;
mod starting;
mod this_machine;
mod watching;

use std::sync::{Arc, Mutex};

use anyhow::Result;
use other_server::{OtherServer, film, household, play};
use recording::{Given, Recording};
use serde_json::{Value, json};

use super::run::run_with;
use super::stages::{
    Importing, LibraryRow, Outcome, PlayRow, Stages, StatePage, TitlePage, UserRows,
};
use crate::db;
use crate::db::imports::NewImport;
use crate::model::imports::{AccountChoice, Import, KeptLibrary, KeptUser, Origin, Selection};
use crate::point::{Point, StubFn};
use crate::services::importers::{Importers, POINT};
use crate::services::jobs::{JobContext, RunHandle};
use crate::state::SharedState;
use crate::test_support::test_state_with_service;

const IMPORTER: &str = "tv.x.import";

fn kept(libraries: &[&str], users: &[&str]) -> Selection {
    Selection {
        libraries: libraries
            .iter()
            .map(|id| KeptLibrary {
                id: (*id).into(),
                ..Default::default()
            })
            .collect(),
        users: users
            .iter()
            .map(|id| KeptUser {
                id: (*id).into(),
                account: AccountChoice::Proposed,
            })
            .collect(),
    }
}

fn everything() -> Selection {
    kept(&["1", "2", "9"], &["42", "43", "44"])
}

fn living_room() -> Origin {
    Origin {
        id: "srv".into(),
        name: "Living room".into(),
    }
}

fn queue(state: &SharedState, selection: &Selection, sign_in: &str) -> String {
    let nth = db::imports::list(&state.db, 100).unwrap().len() as i64 + 1;
    let id = format!("i{nth}");
    let new = NewImport {
        id: &id,
        importer: IMPORTER,
        server: &living_room(),
        sign_in,
        selection,
        started_by: None,
        created_ms: nth,
    };
    assert!(db::imports::queue(&state.db, &new).unwrap());
    id
}

struct Ran {
    import: Import,
    result: Result<()>,
    run: Arc<RunHandle>,
}

fn a_run() -> Arc<RunHandle> {
    Arc::new(RunHandle::new(
        "run-1".into(),
        super::JOB.as_str().to_string(),
    ))
}

fn run_on(state: &SharedState, stages: &dyn Stages, run: Arc<RunHandle>) -> Result<()> {
    run_with(&JobContext::from_handle(state.clone(), run), stages)
}

fn import_signed_in(
    state: &SharedState,
    stages: &dyn Stages,
    (selection, sign_in): (&Selection, &str),
) -> Ran {
    let id = queue(state, selection, sign_in);
    let run = a_run();
    let result = run_on(state, stages, run.clone());
    Ran {
        import: db::imports::get(&state.db, &id).unwrap().unwrap(),
        result,
        run,
    }
}

fn import(state: &SharedState, stages: &dyn Stages, selection: &Selection) -> Ran {
    import_signed_in(state, stages, (selection, "s-1"))
}

fn importing_from(server: &OtherServer) -> SharedState {
    test_state_with_service(server.importers())
}

const RECORDS: &str = "SELECT kind || '|' || scope || '|' || source_id || '|' || fingerprint \
    || '|' || COALESCE(target, '') || '|' || import_id FROM import_records ORDER BY 1";

const TITLES: &str = "SELECT title_id || '|' || described FROM import_titles ORDER BY 1";

fn lines(state: &SharedState, sql: &str) -> Vec<String> {
    let conn = state.db.get().unwrap();
    let mut stmt = conn.prepare(sql).unwrap();
    let rows = stmt.query_map([], |r| r.get(0)).unwrap();
    rows.map(Result::unwrap).collect()
}

fn records(state: &SharedState) -> Vec<String> {
    lines(state, RECORDS)
}
