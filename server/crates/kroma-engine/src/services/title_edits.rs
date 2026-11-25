//! What a person who manages the library writes by hand about a film or a
//! show (LIB-83). Each field comes before the provider's in every language, a
//! refresh of the title's metadata leaves it where it is, and search finds the
//! title under it.

use anyhow::Result;

use crate::db;
use crate::db::title_edits::Title;
use crate::domain::ratings::written_ratings;
use crate::model::title_edit::TitleEdit;
use crate::services::search::spawn_reindex;
use crate::services::titles::{announce, exists};
use crate::state::SharedState;

/// What writing about a title did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Edit {
    /// The title shows these fields now, trimmed, with the empty ones handed
    /// back to the provider.
    Kept(Box<TitleEdit>),
    /// A field is longer than a title can hold, or the year is out of range.
    DoesNotFit,
    /// No country's system has the age rating written.
    UnknownRating,
    /// No title has that id.
    NoSuchTitle,
}

/// Keep `edit` for `title`, in place of what was written before.
pub fn write(state: &SharedState, title: Title<'_>, edit: TitleEdit) -> Result<Edit> {
    let edit = edit.tidied();
    if edit.content_rating.as_deref().is_some_and(unknown) {
        return Ok(Edit::UnknownRating);
    }
    if !edit.fits() {
        return Ok(Edit::DoesNotFit);
    }
    if !exists(&state.db, title.kind, title.id)? {
        return Ok(Edit::NoSuchTitle);
    }
    db::title_edits::write(&state.db, title, &edit)?;
    announce(state, title.kind, title.id);
    spawn_reindex(state.clone());
    Ok(Edit::Kept(Box::new(edit)))
}

fn unknown(rating: &str) -> bool {
    written_ratings(rating).is_empty()
}

#[cfg(test)]
mod tests;
