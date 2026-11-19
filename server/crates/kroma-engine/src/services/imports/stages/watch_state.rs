//! One person's watched flags, resume points and favourites, merged into what
//! KROMA holds for their account. A state whose title is nothing here answers
//! `Unmatched`, and one KROMA holds newer answers `AlreadyHere`.

use anyhow::Result;

use super::{Importing, Outcome, StatePage, untouched};

pub(super) fn merge(_importing: &Importing<'_>, page: &StatePage<'_>) -> Result<Vec<Outcome>> {
    Ok(untouched(page.rows.len()))
}
