//! The rows of an inbox that name a title the reader may no longer see: a film
//! announced to everyone, a show in a library outside the grant, a title above
//! the profile's ceiling. They stay stored and are left out of what is read.

use std::collections::HashSet;

use axum::response::Response;

use crate::api::visibility::{self, Viewer};
use crate::db::notifications::StoredNotification;
use crate::model::SubjectKind;
use crate::state::SharedState;

pub(super) async fn keep_visible(
    state: &SharedState,
    viewer: &Viewer,
    stored: Vec<StoredNotification>,
) -> Result<Vec<StoredNotification>, Response> {
    if viewer.keeps_nothing() {
        return Ok(stored);
    }
    let titles: Vec<String> = stored
        .iter()
        .filter_map(title_of)
        .map(str::to_string)
        .collect();
    let seen: HashSet<String> = visibility::visible_saved_ids(state, viewer, titles).await?;
    Ok(stored
        .into_iter()
        .filter(|row| title_of(row).is_none_or(|id| seen.contains(id)))
        .collect())
}

fn title_of(row: &StoredNotification) -> Option<&str> {
    let subject = row.subject.as_ref()?;
    [SubjectKind::MOVIE, SubjectKind::SHOW, SubjectKind::EPISODE]
        .contains(&subject.kind.as_str())
        .then_some(subject.id.as_str())
}
