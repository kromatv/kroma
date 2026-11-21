//! Who a title is shown to: an account with its library grant (ACCT-20) and
//! the maturity ceiling it is held to (ACCT-109). Both rules live on one type
//! so a caller that applies one cannot forget the other.

use std::collections::{HashMap, HashSet};

use crate::db::{self, TitleAccess};
use crate::domain::{
    Ceiling, CountryRatings, Kind, LibraryScope, MediaItem, Metadata, SectionItem, Show, User,
};
use crate::services::settings;
use crate::state::SharedState;

/// The account a request is answered for, and what is kept from it.
#[derive(Debug, Clone)]
pub struct Viewer {
    pub user: User,
    pub ceiling: Ceiling,
}

/// The ratings of the shows behind a list's episodes, by show id: an episode
/// is held to its show's rating (ACCT-103).
pub type ShowRatings = HashMap<String, TitleAccess>;

impl Viewer {
    /// `user` with the ceiling and ratings country stored on its row, read
    /// against the household's metadata country. Blocking: it reads the
    /// database.
    pub fn load(state: &SharedState, user: User) -> anyhow::Result<Viewer> {
        let server = settings::metadata_country(&state.settings, &state.config);
        let stored = db::profile_maturity(&state.db, &user.id)?;
        Ok(Viewer {
            ceiling: Ceiling {
                level: stored.level,
                reader: stored.ratings_country.unwrap_or_else(|| server.clone()),
                server,
            },
            user,
        })
    }

    /// Whether a ceiling keeps anything from this account. An account with a
    /// management right reaches every title through the console, so it is
    /// never held to one (ACCT-150).
    pub fn is_held(&self) -> bool {
        !self.ceiling.hides_nothing() && !self.user.is_any_admin()
    }

    /// Nothing is kept from this account, by grant or by ceiling.
    pub fn sees_everything(&self) -> bool {
        self.user.sees_every_library() && !self.is_held()
    }

    /// Neither a grant nor a ceiling keeps anything from this account, so a
    /// list it is handed needs no filter.
    pub fn keeps_nothing(&self) -> bool {
        !self.is_held()
            && (self.user.sees_every_library() || self.user.libraries == LibraryScope::All)
    }

    pub fn sees_library(&self, library: &str) -> bool {
        self.user.sees_library(library)
    }

    pub fn sees(&self, title: &TitleAccess) -> bool {
        self.sees_library(&title.library)
            && self.admits(&title.ratings, title.certification.as_deref())
    }

    pub fn sees_show(&self, show: &Show) -> bool {
        self.sees_library(&show.library) && self.admits_metadata(show.metadata.as_ref())
    }

    /// A film by its own metadata, an episode by its show's in `shows`. An
    /// episode whose show is missing from `shows` counts as unrated.
    pub fn sees_item(&self, item: &MediaItem, shows: &ShowRatings) -> bool {
        if !self.sees_library(&item.library) {
            return false;
        }
        if !self.is_held() {
            return true;
        }
        match item.kind {
            Kind::Episode => item
                .show_id
                .as_deref()
                .and_then(|id| shows.get(id))
                .is_some_and(|show| self.admits(&show.ratings, show.certification.as_deref())),
            _ => self.admits_metadata(item.metadata.as_ref()),
        }
    }

    /// A home or search entry, which is always a film or a show.
    pub fn sees_entry(&self, entry: &SectionItem) -> bool {
        match entry {
            SectionItem::Movie { item } => self.sees_item(item, &ShowRatings::new()),
            SectionItem::Show { show } => self.sees_show(show),
        }
    }

    /// The ids among `titles` this account sees, for a filter that runs where
    /// the titles themselves are not at hand (the search index).
    pub fn seen_ids(&self, titles: &HashMap<String, TitleAccess>) -> HashSet<String> {
        titles
            .iter()
            .filter(|(_, title)| self.sees(title))
            .map(|(id, _)| id.clone())
            .collect()
    }

    /// Whether a title's badge must be recomputed for this account: the one
    /// stored was picked for the household's own country.
    pub fn reads_elsewhere(&self) -> bool {
        self.ceiling.reader != self.ceiling.server
    }

    /// Point a title's badge at this account's ratings country (ACCT-105).
    pub fn relabel(&self, meta: Option<&mut Metadata>) {
        if let Some(meta) = meta.filter(|_| self.reads_elsewhere()) {
            self.ceiling.relabel(meta);
        }
    }

    pub fn relabel_entry(&self, entry: &mut SectionItem) {
        match entry {
            SectionItem::Movie { item } => self.relabel(item.metadata.as_mut()),
            SectionItem::Show { show } => self.relabel(show.metadata.as_mut()),
        }
    }

    fn admits(&self, ratings: &CountryRatings, legacy: Option<&str>) -> bool {
        !self.is_held() || self.ceiling.admits(ratings, legacy)
    }

    fn admits_metadata(&self, meta: Option<&Metadata>) -> bool {
        !self.is_held() || self.ceiling.admits_metadata(meta)
    }
}

#[cfg(test)]
mod tests;
