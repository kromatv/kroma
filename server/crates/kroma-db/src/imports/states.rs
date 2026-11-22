//! One person's watch state as an import brings it: merged into what their
//! account holds for a title, or held for a file no title has yet.

mod held;
mod here;

use kroma_domain::watching::Watching;
use rusqlite::{Connection, TransactionBehavior};

pub(crate) use held::release as release_held_states;
use here::{merge_into, Title, SHOWS, TITLES};

use crate::{Pool, Result};

/// Where a state an import brings belongs: on a title of the catalogue, on a
/// show, or with a file of this machine that no title has yet, by its path as
/// a scan writes it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Place<'a> {
    Title(&'a str),
    Show(&'a str),
    File(&'a str),
}

/// What became of one state or play. `Gone` is one whose title or account
/// left the server while the import ran: nothing was written for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Merged {
    Changed,
    Unchanged,
    Gone,
}

/// Merges each state into what `account` holds at its place, in one
/// transaction, and answers one [`Merged`] per state in the order given.
///
/// The newer wins and this server wins a tie, as [`Watching::merged_with`]
/// rules, and each write is stamped with the time the state carries. A state
/// for a file is held until a scan writes that file, and shows on its title
/// in that same write.
pub fn merge_states(
    pool: &Pool,
    account: &str,
    states: &[(Place<'_>, Watching)],
) -> Result<Vec<Merged>> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let merged = merge_each(&tx, account, states)?;
    tx.commit()?;
    Ok(merged)
}

fn merge_each(
    conn: &Connection,
    account: &str,
    states: &[(Place<'_>, Watching)],
) -> Result<Vec<Merged>> {
    if !here::exists(conn, "users", account)? {
        return Ok(vec![Merged::Gone; states.len()]);
    }
    let merged = states
        .iter()
        .map(|(place, brought)| merge_one(conn, account, (place, brought)))
        .collect::<Result<Vec<_>>>()?;
    if states.iter().any(|(place, _)| matches!(place, Place::File(_))) {
        held::release(conn)?;
    }
    Ok(merged)
}

fn merge_one(
    conn: &Connection,
    account: &str,
    (place, brought): (&Place<'_>, &Watching),
) -> Result<Merged> {
    match *place {
        Place::Title(item) => merge_into(conn, (TITLES, &Title { account, item }), brought),
        Place::Show(item) => merge_into(conn, (SHOWS, &Title { account, item }), brought),
        Place::File(path) => held::hold(conn, account, path, brought),
    }
}
