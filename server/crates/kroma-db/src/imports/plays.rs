//! The plays an import brings into the play log, each as a row that names the
//! server it came from, or held for a file no title has yet.
//!
//! A play is the same play when the same server gives it the same id. The id
//! of its row is derived from the two, so a play brought twice is one row.

mod held;

use rusqlite::{params, Connection, TransactionBehavior};

pub(crate) use held::release as release_held_plays;

use super::Place;
use crate::{Pool, Result};

const INTO_THE_LOG: &str = "INSERT INTO play_history \
    (id, user_id, username, item_id, kind, title, library, show_title, season, episode, \
     started_at, ended_at, watched_ms, import_server_id)";

const WHO_AND_WHAT: &str = "u.id, u.username, i.id, i.kind, i.title, i.library, \
    COALESCE(s.title, i.show_title), i.season, i.episode";

/// One play of another server. `id` is that server's own id for the play,
/// `played_at` is epoch seconds, and `duration_ms` is `None` where the server
/// recorded none.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NewPlay<'a> {
    pub id: &'a str,
    pub account: &'a str,
    pub place: Place<'a>,
    pub played_at: i64,
    pub duration_ms: Option<i64>,
}

/// What became of one play. `Gone` is a play whose title or account left the
/// server while the import ran: nothing was written for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Added {
    New,
    AlreadyHere,
    Gone,
}

struct Keyed<'a> {
    id: String,
    server_id: &'a str,
    play: &'a NewPlay<'a>,
}

impl<'a> Keyed<'a> {
    fn of(server_id: &'a str, play: &'a NewPlay<'a>) -> Self {
        let named = format!("import-play|{server_id}|{}", play.id);
        Self {
            id: kroma_primitives::short_hash(&named),
            server_id,
            play,
        }
    }
}

fn logged(conn: &Connection, id: &str) -> rusqlite::Result<bool> {
    conn.prepare_cached("SELECT EXISTS (SELECT 1 FROM play_history WHERE id = ?1)")?
        .query_row([id], |r| r.get(0))
}

fn log(conn: &Connection, row: &Keyed<'_>, item: &str) -> Result<Added> {
    let written = conn
        .prepare_cached(&format!(
            "{INTO_THE_LOG} SELECT ?1, {WHO_AND_WHAT}, ?4, ?4, ?5, ?6 \
             FROM users u JOIN items i ON i.id = ?3 LEFT JOIN shows s ON s.id = i.show_id \
             WHERE u.id = ?2"
        ))?
        .execute(params![
            row.id,
            row.play.account,
            item,
            row.play.played_at,
            row.play.duration_ms.unwrap_or(0),
            row.server_id
        ])?;
    Ok(if written == 1 {
        Added::New
    } else {
        Added::Gone
    })
}

fn add(conn: &Connection, server_id: &str, play: &NewPlay<'_>) -> Result<Added> {
    let row = Keyed::of(server_id, play);
    if logged(conn, &row.id)? {
        return Ok(Added::AlreadyHere);
    }
    match play.place {
        Place::Title(item) => log(conn, &row, item),
        Place::File(path) => held::hold(conn, &row, path),
    }
}

/// Adds each play of the server `server_id` to the play log, in one
/// transaction, and answers one [`Added`] per play in the order given.
///
/// A play the log or the hold already has is left as it is. A play for a file
/// is held until a scan writes that file, and joins the log in that same
/// write. A play with no duration is logged with none: the log reads the
/// runtime of its title in its place.
pub fn add_plays(pool: &Pool, server_id: &str, plays: &[NewPlay<'_>]) -> Result<Vec<Added>> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let added = plays
        .iter()
        .map(|play| add(&tx, server_id, play))
        .collect::<Result<Vec<_>>>()?;
    if plays
        .iter()
        .any(|play| matches!(play.place, Place::File(_)))
    {
        held::release(&tx)?;
    }
    tx.commit()?;
    Ok(added)
}
