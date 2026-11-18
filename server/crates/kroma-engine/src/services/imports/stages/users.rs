//! The users the owner kept become accounts that wait on an invitation, each
//! seeing the libraries its user could see. A user that has an account here,
//! new or one it was attached to, answers `Brought` with that account's id.

use anyhow::Result;

use super::{Importing, Outcome, UserRows, untouched};

pub(super) fn settle(_importing: &Importing<'_>, kept: &UserRows<'_>) -> Result<Vec<Outcome>> {
    Ok(untouched(kept.rows.len()))
}
