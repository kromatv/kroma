//! Starting an import: what the owner kept on the review screen is queued as
//! the import's own row, and the job that runs it is triggered.

use std::collections::HashSet;

use super::JOB;
use crate::db;
use crate::db::imports::NewImport;
use crate::model::imports::{AccountChoice, Origin, Selection};
use crate::services::importers::{Importers, bounded_id};
use crate::services::jobs::{TriggerError, now_ms};
use crate::state::SharedState;

const MAX_NAME_CHARS: usize = 200;

/// One import to run: the importer and the server to read, the reference the
/// importer gave for its sign-in, what the owner kept, and the account that
/// asks.
pub struct Request {
    pub importer: String,
    pub sign_in: String,
    pub server: Origin,
    pub selection: Selection,
    pub started_by: String,
}

/// The import that was queued and the job run that carries it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Started {
    pub id: String,
    pub run_id: Option<String>,
}

/// Why no import started. `Invalid` says what the request got wrong, an attach
/// to an account this server does not have included, `Absent` that no running
/// importer has that id, and `Busy` that another import is queued or running.
#[derive(Debug)]
pub enum StartError {
    Invalid(String),
    Absent,
    Busy,
    Internal(anyhow::Error),
}

impl From<anyhow::Error> for StartError {
    fn from(error: anyhow::Error) -> Self {
        Self::Internal(error)
    }
}

fn once_each<T>(what: &str, kept: Vec<T>, id: impl Fn(&T) -> &str) -> Result<Vec<T>, StartError> {
    let mut seen = HashSet::new();
    let mut unique = Vec::with_capacity(kept.len());
    for one in kept {
        bounded_id(what, id(&one)).map_err(StartError::Invalid)?;
        if seen.insert(id(&one).to_string()) {
            unique.push(one);
        }
    }
    Ok(unique)
}

fn checked(request: Request) -> Result<Request, StartError> {
    bounded_id("sign-in", &request.sign_in).map_err(StartError::Invalid)?;
    bounded_id("server", &request.server.id).map_err(StartError::Invalid)?;
    Ok(Request {
        server: Origin {
            name: kroma_primitives::clean_label(&request.server.name, MAX_NAME_CHARS),
            ..request.server
        },
        selection: Selection {
            libraries: once_each("library", request.selection.libraries, |kept| &kept.id)?,
            users: once_each("user", request.selection.users, |kept| &kept.id)?,
        },
        ..request
    })
}

fn attached_to_accounts_here(state: &SharedState, selection: &Selection) -> Result<(), StartError> {
    for kept in &selection.users {
        let AccountChoice::Existing(account) = &kept.account else {
            continue;
        };
        bounded_id("account", account).map_err(StartError::Invalid)?;
        if db::user_by_id(&state.db, account)?.is_none() {
            let what = "a user attached to an account this server does not have";
            return Err(StartError::Invalid(what.to_string()));
        }
    }
    Ok(())
}

fn answering(state: &SharedState, importer: &str) -> bool {
    kroma_module_host::service::<Importers>(state.as_ref())
        .is_some_and(|importers| importers.answering().iter().any(|id| id == importer))
}

/// Queues one import and triggers the job that runs it. One import runs at a
/// time.
pub fn start(state: &SharedState, request: Request) -> Result<Started, StartError> {
    let request = checked(request)?;
    if !answering(state, &request.importer) {
        return Err(StartError::Absent);
    }
    attached_to_accounts_here(state, &request.selection)?;
    let id = format!("import-{}", &kroma_primitives::random_token()[..16]);
    let new = NewImport {
        id: &id,
        importer: &request.importer,
        server: &request.server,
        sign_in: &request.sign_in,
        selection: &request.selection,
        started_by: Some(&request.started_by),
        created_ms: now_ms(),
    };
    if !db::imports::queue(&state.db, &new)? {
        return Err(StartError::Busy);
    }
    triggered(state, id)
}

fn triggered(state: &SharedState, id: String) -> Result<Started, StartError> {
    match state.jobs.trigger(state.clone(), JOB, "manual") {
        Ok(run_id) => Ok(Started {
            id,
            run_id: Some(run_id),
        }),
        Err(TriggerError::AlreadyRunning) => claimed_or_withdrawn(state, id),
        Err(TriggerError::Unknown) => {
            db::imports::withdraw(&state.db, &id)?;
            Err(StartError::Internal(anyhow::anyhow!(
                "the import job is not registered"
            )))
        }
    }
}

pub(super) fn claimed_or_withdrawn(state: &SharedState, id: String) -> Result<Started, StartError> {
    if db::imports::withdraw(&state.db, &id)? {
        return Err(StartError::Busy);
    }
    let run_id = db::imports::get(&state.db, &id)?.and_then(|import| import.run_id);
    Ok(Started { id, run_id })
}
