use anyhow::Result;

use crate::client::Session;
use crate::jellyfin;
use crate::queries::{counted, films_and_episodes, filtered, playlists};
use crate::wire::{Counts, Library, LibraryKind, Survey, SurveyAsk, User};
use crate::Importer;

const MAX_COUNTED_USERS: usize = 50;

pub(crate) const PLAYED: &str = "IsPlayed";
pub(crate) const STARTED: &str = "IsResumable,IsUnplayed";

fn kind(collection_type: Option<&str>) -> LibraryKind {
    match collection_type {
        Some("movies") => LibraryKind::Movies,
        Some("tvshows") => LibraryKind::Shows,
        Some("mixed") | None => LibraryKind::Mixed,
        Some(_) => LibraryKind::Other,
    }
}

fn library(folder: jellyfin::Library) -> Option<Library> {
    (!folder.item_id.is_empty()).then(|| Library {
        kind: kind(folder.collection_type.as_deref()),
        id: folder.item_id,
        name: folder.name,
        folders: folder.locations,
    })
}

fn finer_limits(policy: &jellyfin::Policy) -> Vec<&'static str> {
    let rated = policy.max_parental_rating.is_some()
        || policy.max_parental_sub_rating.is_some()
        || !policy.block_unrated_items.is_empty();
    let tagged = !policy.blocked_tags.is_empty() || !policy.allowed_tags.is_empty();
    [
        ("rating", rated),
        ("tag", tagged),
        ("schedule", !policy.access_schedules.is_empty()),
        ("blockedFolders", !policy.blocked_media_folders.is_empty()),
        ("disabled", policy.is_disabled),
    ]
    .into_iter()
    .filter_map(|(limit, applies)| applies.then_some(limit))
    .collect()
}

fn user(found: jellyfin::User, signed_in: &str) -> Option<User> {
    if found.id.is_empty() {
        return None;
    }
    let all_libraries = found.policy.enable_all_folders;
    Some(User {
        signed_in: found.id == signed_in,
        finer_limits: finer_limits(&found.policy),
        libraries: if all_libraries {
            Vec::new()
        } else {
            found.policy.enabled_folders
        },
        all_libraries,
        id: found.id,
        name: found.name,
    })
}

fn left_behind(counts: &jellyfin::Counts, playlists: u64) -> Vec<&'static str> {
    [
        ("playlists", playlists),
        ("collections", counts.box_set_count),
        ("liveTv", counts.program_count),
    ]
    .into_iter()
    .filter_map(|(what, held)| (held > 0).then_some(what))
    .collect()
}

fn count(session: &Session<'_>, query: crate::web::Query) -> Result<u64> {
    let page: jellyfin::ItemsPage = session.get(session.dialect().items, counted(query))?;
    Ok(page.total_record_count)
}

fn watched(session: &Session<'_>, users: &[User]) -> Result<Option<u64>> {
    if users.len() > MAX_COUNTED_USERS {
        return Ok(None);
    }
    let mut total = 0;
    for user in users {
        for filters in [PLAYED, STARTED] {
            total += count(session, filtered(films_and_episodes(&user.id), filters))?;
        }
    }
    Ok(Some(total))
}

impl Importer {
    pub(crate) fn survey(&self, ask: &SurveyAsk) -> Result<Survey> {
        let session = self.session(&ask.sign_in, &ask.server)?;
        let dialect = self.dialect;
        let folders: Vec<jellyfin::Library> = session.get(dialect.libraries, Vec::new())?;
        let found: Vec<jellyfin::User> = session.get(dialect.users, Vec::new())?;
        let held: jellyfin::Counts = session.get(dialect.counts, Vec::new())?;
        let users: Vec<User> = found
            .into_iter()
            .filter_map(|one| user(one, session.user()))
            .collect();
        let watched = watched(&session, &users)?;
        Ok(Survey {
            libraries: folders.into_iter().filter_map(library).collect(),
            counts: Counts {
                titles: Some(held.movie_count + held.episode_count),
                states: watched,
                plays: watched,
            },
            left_behind: left_behind(&held, count(&session, playlists(session.user()))?),
            users,
        })
    }
}

#[cfg(test)]
mod tests;
