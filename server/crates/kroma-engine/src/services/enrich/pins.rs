//! Which TMDB id a title is held to ahead of its name, and who says so: a
//! match made by hand, then an acquisition, then the identity an import kept,
//! then the `.nfo` file beside the title. An identity or a file that names no
//! TMDB id, only an IMDb or a TheTVDB one, is asked of TMDB once, and the
//! answer is kept. Such an identity waits behind a file that names a TMDB id,
//! and such a file behind the identity.

use std::collections::HashMap;

use tracing::warn;

use crate::db::imports::{Elsewhere, Lead, Subject};
use crate::db::{self, Pool};
use crate::infra::metadata::{self, Catalogue};
use crate::state::SharedState;

use super::engine::Engine;
use super::jobs::Job;

#[derive(Default)]
pub(super) struct Pins {
    pub(super) items: HashMap<String, u64>,
    pub(super) shows: HashMap<String, u64>,
    pub(super) unasked_items: HashMap<String, Elsewhere>,
    pub(super) unasked_shows: HashMap<String, Elsewhere>,
}

pub(super) fn lead_for(state: &SharedState, kind: &str, id: &str) -> Option<Lead> {
    let conn = state.db.get().ok()?;
    if let Some(pin) = db::tmdb_pin::get(&conn, kind, id).ok().flatten() {
        return Some(Lead::Tmdb(pin));
    }
    let (acquired, subject) = if kind == db::metadata_core::SHOW {
        (db::acq_tmdb_for_show(&conn, id), Subject::Show)
    } else {
        (db::acq_tmdb_for_item(&conn, id), Subject::Movie)
    };
    if let Some(tmdb) = acquired.ok().flatten() {
        return Some(Lead::Tmdb(tmdb));
    }
    let identity = db::imports::identity_lead(&conn, subject, id)
        .ok()
        .flatten();
    let beside = db::text_beside::lead(&conn, kind, id).ok().flatten();
    first_lead(identity, beside)
}

fn first_lead(identity: Option<Lead>, beside: Option<Lead>) -> Option<Lead> {
    match (identity, beside) {
        (Some(Lead::Tmdb(tmdb)), _) | (_, Some(Lead::Tmdb(tmdb))) => Some(Lead::Tmdb(tmdb)),
        (identity, beside) => identity.or(beside),
    }
}

type Held = (HashMap<String, u64>, HashMap<String, Elsewhere>);

fn split(leads: HashMap<String, Lead>) -> Held {
    let mut named = HashMap::new();
    let mut unasked = HashMap::new();
    for (id, lead) in leads {
        match lead {
            Lead::Tmdb(tmdb) => {
                named.insert(id, tmdb);
            }
            Lead::Ask(elsewhere) => {
                unasked.insert(id, elsewhere);
            }
        }
    }
    (named, unasked)
}

fn held(pool: &Pool, subject: Subject) -> Held {
    let kind = kind_of(subject);
    let beside = db::text_beside::leads(pool, kind).unwrap_or_default();
    let identities = db::imports::identity_leads(pool, subject).unwrap_or_default();
    let (mut named, beside_unasked) = split(beside);
    let (imported, mut unasked) = split(identities);
    named.extend(imported);
    for (id, elsewhere) in beside_unasked {
        unasked.entry(id).or_insert(elsewhere);
    }
    (named, unasked)
}

fn kind_of(subject: Subject) -> &'static str {
    match subject {
        Subject::Movie => db::metadata_core::ITEM,
        Subject::Show => db::metadata_core::SHOW,
    }
}

pub(super) fn load_pins(pool: &Pool) -> Pins {
    let (mut items, mut unasked_items) = held(pool, Subject::Movie);
    let (mut shows, mut unasked_shows) = held(pool, Subject::Show);
    items.extend(db::acq_tmdb_by_item(pool).unwrap_or_default());
    shows.extend(db::acq_tmdb_by_show(pool).unwrap_or_default());
    items.extend(db::tmdb_pin::all_for_kind(pool, db::metadata_core::ITEM).unwrap_or_default());
    shows.extend(db::tmdb_pin::all_for_kind(pool, db::metadata_core::SHOW).unwrap_or_default());
    unasked_items.retain(|id, _| !items.contains_key(id));
    unasked_shows.retain(|id, _| !shows.contains_key(id));
    Pins {
        items,
        shows,
        unasked_items,
        unasked_shows,
    }
}

fn ask_tmdb(eng: &Engine, job: &Job, unasked: &Elsewhere) -> Result<Option<u64>, ()> {
    if let Some(imdb) = &unasked.imdb {
        let found = metadata::find_id(&eng.api_key, job.target, Catalogue::Imdb, imdb)?;
        if found.is_some() {
            return Ok(found);
        }
    }
    match unasked.tvdb {
        Some(tvdb) => {
            let tvdb = tvdb.to_string();
            metadata::find_id(&eng.api_key, job.target, Catalogue::Tvdb, &tvdb)
        }
        None => Ok(None),
    }
}

pub(super) fn identified(eng: &Engine, mut job: Job) -> Job {
    let Some(unasked) = job.unasked.take() else {
        return job;
    };
    let Ok(found) = ask_tmdb(eng, &job, &unasked) else {
        return job;
    };
    let subject = if job.is_show {
        Subject::Show
    } else {
        Subject::Movie
    };
    if let Err(e) = db::imports::answer_identities(&eng.pool, subject, &unasked, found) {
        warn!(id = %job.id, error = %e, "failed to keep what TMDB answered for an imported identity");
    }
    if let Err(e) = db::text_beside::answer(&eng.pool, kind_of(subject), &unasked, found) {
        warn!(id = %job.id, error = %e, "failed to keep what TMDB answered for the ids a .nfo names");
    }
    job.pin = job.pin.or(found);
    job
}
