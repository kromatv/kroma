use std::collections::HashSet;

use serde_json::{Value, json};

use super::support::{MOVIE_TMDB, SHOW_TMDB};
use crate::db;
use crate::db::imports::{Elsewhere, FileIdentity, HeldIds, NewImport, Subject};
use crate::db::text_beside::{Nfo, Text};
use crate::model::imports::{Origin, Selection};
use crate::state::SharedState;

pub(super) const HEAT: u64 = 949;
pub(super) const THE_WIRE: u64 = 1438;
pub(super) const BY_HAND: u64 = 11;
pub(super) const MOVIE_FILE: &str = "/media/m1.mkv";
pub(super) const EPISODE_FILE: &str = "/media/s1e1.mkv";
pub(super) const HEAT_ON_IMDB: &str = "tt0113277";
pub(super) const WHILE_TMDB_IS_DOWN: &str = "tt0000002";

pub(super) fn catalogue(path: &str) -> (u16, Value) {
    match path {
        "/search/movie" => (
            200,
            json!({ "results": [{ "id": MOVIE_TMDB, "title": "Title m1" }] }),
        ),
        "/search/tv" => (
            200,
            json!({ "results": [{ "id": SHOW_TMDB, "name": "Show s1" }] }),
        ),
        "/movie/603" => (200, json!({ "id": MOVIE_TMDB, "title": "Title m1" })),
        "/movie/949" => (200, json!({ "id": HEAT, "title": "Heat" })),
        "/movie/11" => (200, json!({ "id": BY_HAND, "title": "Star Wars" })),
        "/tv/1396" => (200, json!({ "id": SHOW_TMDB, "name": "Show s1" })),
        "/tv/1438" => (200, json!({ "id": THE_WIRE, "name": "The Wire" })),
        "/find/tt0113277" => (200, json!({ "movie_results": [{ "id": HEAT }] })),
        "/find/79126" => (200, json!({ "tv_results": [{ "id": THE_WIRE }] })),
        _ => (404, json!({})),
    }
}

pub(super) fn by_tmdb(tmdb: u64) -> HeldIds {
    HeldIds {
        tmdb: Some(tmdb),
        ..Default::default()
    }
}

pub(super) fn by_imdb(imdb: &str) -> HeldIds {
    HeldIds {
        tmdb: None,
        elsewhere: Elsewhere {
            imdb: Some(imdb.into()),
            tvdb: None,
        },
    }
}

pub(super) fn by_tvdb(tvdb: u64) -> HeldIds {
    HeldIds {
        tmdb: None,
        elsewhere: Elsewhere {
            imdb: None,
            tvdb: Some(tvdb),
        },
    }
}

pub(super) fn an_import_kept(state: &SharedState, files: &[(&str, Subject, HeldIds)]) {
    let server = Origin {
        id: "srv".into(),
        name: String::new(),
    };
    let new = NewImport {
        id: "i1",
        importer: "tv.x.import",
        server: &server,
        sign_in: "s-1",
        selection: &Selection::default(),
        started_by: None,
        created_ms: 1,
    };
    db::imports::queue(&state.db, &new).unwrap();
    let identities: Vec<FileIdentity> = files
        .iter()
        .map(|(path, subject, ids)| FileIdentity {
            path: (*path).into(),
            subject: *subject,
            ids: ids.clone(),
        })
        .collect();
    let server_id = db::imports::server_key("tv.x.import", "srv");
    db::imports::keep_identities(&state.db, &server_id, &identities).unwrap();
}

pub(super) fn files_beside_name(state: &SharedState, files: &[(&'static str, &str, u64)]) {
    let texts: Vec<Text> = files
        .iter()
        .map(|&(kind, id, tmdb)| Text {
            nfo: Nfo {
                subject_kind: kind,
                subject_id: id.into(),
                library: "lib".into(),
                path: format!("/media/{kind}/{id}.nfo"),
                modified: None,
            },
            edit: Default::default(),
            tmdb: Some(tmdb),
        })
        .collect();
    db::text_beside::replace(&state.db, &texts, &HashSet::new()).unwrap();
}
