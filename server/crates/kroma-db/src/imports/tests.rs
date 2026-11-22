mod catalogue;
mod folders;
mod identities;
mod newcomers;
mod plays;
mod records;
mod runs;
mod states;

use kroma_domain::import::Title;
use kroma_domain::imports::{
    AccountChoice, Failure, FailureReason, KeptFolder, KeptLibrary, KeptUser, Kind, Origin, Report,
    Selection, Status,
};
use serde_json::json;

use super::*;
use crate::testing::TempPool;

const IMPORTER: &str = "tv.x.import";

fn pool() -> TempPool {
    crate::testing::temp_pool("imports")
}

fn living_room() -> Origin {
    Origin {
        id: "srv".into(),
        name: "Living room".into(),
    }
}

fn kept() -> Selection {
    Selection {
        libraries: vec![KeptLibrary {
            id: "1".into(),
            ..Default::default()
        }],
        users: vec![KeptUser {
            id: "42".into(),
            account: AccountChoice::Proposed,
        }],
    }
}

fn import_of<'a>(id: &'a str, server: &'a Origin, selection: &'a Selection) -> NewImport<'a> {
    NewImport {
        id,
        importer: IMPORTER,
        server,
        sign_in: "s-1",
        selection,
        started_by: None,
        created_ms: 2,
    }
}

fn queue_from(pool: &Pool, id: &str, server: &Origin) -> bool {
    queue(pool, &import_of(id, server, &kept())).unwrap()
}

fn queue_at(pool: &Pool, id: &str, created_ms: i64) -> bool {
    let (server, selection) = (living_room(), kept());
    let new = NewImport {
        created_ms,
        ..import_of(id, &server, &selection)
    };
    queue(pool, &new).unwrap()
}

fn end(pool: &Pool, id: &str, status: Status) {
    let ending = Ending {
        status,
        failure: None,
        report: &Report::default(),
        finished_ms: 9,
    };
    finish(pool, id, &ending).unwrap();
}

fn ran(pool: &Pool, id: &str, created_ms: i64) {
    assert!(queue_at(pool, id, created_ms));
    claim(pool, "run", created_ms).unwrap();
    end(pool, id, Status::Completed);
}

fn film(id: &str, name: &str) -> Title {
    serde_json::from_value(json!({ "id": id, "kind": "movie", "title": name })).unwrap()
}

fn states_of<'a>(server_id: &'a str, user: &'a str) -> Ledger<'a> {
    Ledger {
        server_id,
        kind: Kind::State,
        scope: user,
    }
}

fn entry<'a>(id: &'a str, fingerprint: &'a str, target: Option<&'a str>) -> Entry<'a> {
    Entry {
        id,
        fingerprint,
        target,
    }
}

fn brought_by(pool: &Pool, source_id: &str) -> String {
    pool.get()
        .unwrap()
        .query_row(
            "SELECT import_id FROM import_records WHERE source_id = ?1",
            [source_id],
            |r| r.get(0),
        )
        .unwrap()
}
