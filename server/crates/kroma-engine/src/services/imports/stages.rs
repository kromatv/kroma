//! Where each kind of row an import reads becomes something in KROMA. The job
//! reads the other server, keeps the record and writes the report. A stage does
//! the writing for one kind and answers one [`Outcome`] per row it was given,
//! in the order it was given them.
//!
//! A stage is offered a row again when a run ended between its write and the
//! record, so bringing the same row twice must leave one copy.

mod found;
mod identities;
mod libraries;
mod plays;
mod users;
mod watch_state;

use std::collections::HashMap;

use anyhow::Result;

use crate::model::import::{Library, Play, Title, User, WatchState};
use crate::model::imports::{Import, KeptLibrary, KeptUser};
use crate::state::SharedState;

/// What a stage did with one row.
///
/// `Brought` and `AlreadyHere` settle the row: the job records it, and a later
/// import offers it again only when the other server changed it. `Brought`
/// wrote something, and its `target` is what the row became when a later stage
/// needs it: a library's source id, a user's account id. `AlreadyHere` wrote
/// nothing because KROMA holds the same or something newer.
///
/// `Unmatched` and `Untouched` leave the row for a later import. `Unmatched` is
/// a watch state or a play whose title is nothing here, and the report lists
/// that title. `Untouched` is a row the stage did not handle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Outcome {
    Brought { target: Option<String> },
    AlreadyHere,
    Unmatched,
    Untouched,
}

/// The import a stage works for. `server_id` is the key of the other server in
/// `import_servers`, the one thing every imported row can name its origin by.
pub(crate) struct Importing<'a> {
    pub state: &'a SharedState,
    pub import: &'a Import,
    pub server_id: &'a str,
}

/// One library the owner kept: as the other server describes it, as the owner
/// kept it, and the source it became in an earlier import.
pub(crate) struct LibraryRow<'a> {
    pub library: &'a Library,
    pub kept: &'a KeptLibrary,
    pub source: Option<&'a str>,
}

/// One user the owner kept: as the other server describes them, as the owner
/// kept them, and the account they became in an earlier import.
pub(crate) struct UserRow<'a> {
    pub user: &'a User,
    pub kept: &'a KeptUser,
    pub account: Option<&'a str>,
}

/// The users the owner kept, with the source each library of this server
/// became, by the other server's id for the library.
pub(crate) struct UserRows<'a> {
    pub rows: &'a [UserRow<'a>],
    pub sources: &'a HashMap<String, String>,
}

/// One page of a library's films and episodes, with the source the library
/// became. A title the record holds unchanged is not on it.
pub(crate) struct TitlePage<'a> {
    pub library: &'a Library,
    pub source: Option<&'a str>,
    pub titles: &'a [&'a Title],
}

pub(crate) struct StateRow<'a> {
    pub state: &'a WatchState,
    pub title: &'a Title,
}

/// One page of one user's watch state, each with the title it is about, and
/// the account that user became.
pub(crate) struct StatePage<'a> {
    pub user: &'a User,
    pub account: &'a str,
    pub rows: &'a [StateRow<'a>],
}

/// One play, with the title it is about and the account of who played it.
pub(crate) struct PlayRow<'a> {
    pub play: &'a Play,
    pub title: &'a Title,
    pub account: &'a str,
}

pub(crate) trait Stages {
    fn libraries(&self, importing: &Importing<'_>, kept: &[LibraryRow<'_>])
    -> Result<Vec<Outcome>>;

    fn users(&self, importing: &Importing<'_>, kept: &UserRows<'_>) -> Result<Vec<Outcome>>;

    fn titles(&self, importing: &Importing<'_>, page: &TitlePage<'_>) -> Result<Vec<Outcome>>;

    fn states(&self, importing: &Importing<'_>, page: &StatePage<'_>) -> Result<Vec<Outcome>>;

    fn plays(&self, importing: &Importing<'_>, page: &[PlayRow<'_>]) -> Result<Vec<Outcome>>;
}

/// The stages the import job runs.
pub(crate) struct Core;

impl Stages for Core {
    fn libraries(
        &self,
        importing: &Importing<'_>,
        kept: &[LibraryRow<'_>],
    ) -> Result<Vec<Outcome>> {
        libraries::place(importing, kept)
    }

    fn users(&self, importing: &Importing<'_>, kept: &UserRows<'_>) -> Result<Vec<Outcome>> {
        users::settle(importing, kept)
    }

    fn titles(&self, importing: &Importing<'_>, page: &TitlePage<'_>) -> Result<Vec<Outcome>> {
        identities::keep(importing, page)
    }

    fn states(&self, importing: &Importing<'_>, page: &StatePage<'_>) -> Result<Vec<Outcome>> {
        watch_state::merge(importing, page)
    }

    fn plays(&self, importing: &Importing<'_>, page: &[PlayRow<'_>]) -> Result<Vec<Outcome>> {
        plays::add(importing, page)
    }
}

fn untouched(rows: usize) -> Vec<Outcome> {
    vec![Outcome::Untouched; rows]
}
