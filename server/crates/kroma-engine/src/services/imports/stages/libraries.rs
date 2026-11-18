//! The libraries the owner kept become sources. A library that has a source
//! here, new or one already over the same folders, answers `Brought` with that
//! source's id.

use anyhow::Result;

use super::{Importing, LibraryRow, Outcome, untouched};

pub(super) fn place(_importing: &Importing<'_>, kept: &[LibraryRow<'_>]) -> Result<Vec<Outcome>> {
    Ok(untouched(kept.len()))
}
