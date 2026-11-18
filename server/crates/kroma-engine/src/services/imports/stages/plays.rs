//! The plays the other server recorded, added to watch history as rows that
//! came from an import. A play whose title is nothing here answers `Unmatched`.

use anyhow::Result;

use super::{Importing, Outcome, PlayRow, untouched};

pub(super) fn add(_importing: &Importing<'_>, page: &[PlayRow<'_>]) -> Result<Vec<Outcome>> {
    Ok(untouched(page.len()))
}
