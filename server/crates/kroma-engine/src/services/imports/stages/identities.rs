//! The title the other server says each file is, kept for matching to take
//! ahead of its own reading of the file's name.

use anyhow::Result;

use super::{Importing, Outcome, TitlePage, untouched};

pub(super) fn keep(_importing: &Importing<'_>, page: &TitlePage<'_>) -> Result<Vec<Outcome>> {
    Ok(untouched(page.titles.len()))
}
