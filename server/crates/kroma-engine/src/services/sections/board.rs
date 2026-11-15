//! What every row of one viewer's home is drawn from: the catalogue, the
//! viewer, and the titles still worth offering them, ranked once.

use std::collections::{HashMap, HashSet};

use crate::db::Pool;
use crate::i18n;
use crate::model::Layout;
use crate::services::reco::catalog::person_key;
use crate::services::reco::rank::{quality, rank};
use crate::services::reco::{genre, Catalog, Feature, Scored, Title, Viewer};
use crate::state::SharedState;

use super::context::Context;

/// A row before it is checked against the rest of the page and hydrated.
#[derive(Debug, Clone)]
pub(super) struct Draft {
    pub id: String,
    pub title: String,
    pub reason: Option<String>,
    pub layout: Layout,
    /// More than the row shows, so it still fills once other rows took theirs.
    pub ids: Vec<String>,
    pub notes: HashMap<String, String>,
    /// A list of facts (what was added, what is trending) shows what it lists
    /// whatever the other rows hold. A recommendation never repeats one.
    pub factual: bool,
    /// Set on a row that claims something of every member ("with this actor",
    /// "like that film"): the lower, the scarcer its members tend to be, and
    /// the earlier it is promised its minimum. `None` for a row any good title
    /// could sit in.
    pub claim: Option<u8>,
    pub min: usize,
    pub cap: usize,
}

pub(super) const CLAIM_PERSON: u8 = 0;
pub(super) const CLAIM_SEED: u8 = 1;
pub(super) const CLAIM_GENRE: u8 = 2;
pub(super) const CLAIM_THEME: u8 = 3;

pub(super) const ROW_CAP: usize = 20;
// Over-fetch margin so a row still fills after cross-row de-duplication.
pub(super) const FETCH: usize = ROW_CAP + 16;
pub(super) const MIN_ITEMS: usize = 5;

impl Draft {
    pub(super) fn rail(id: impl Into<String>, title: String, ids: Vec<String>) -> Self {
        Self {
            id: id.into(),
            title,
            reason: None,
            layout: Layout::Rail,
            ids,
            notes: HashMap::new(),
            factual: false,
            claim: None,
            min: MIN_ITEMS,
            cap: ROW_CAP,
        }
    }

    pub(super) fn factual(mut self) -> Self {
        self.factual = true;
        self
    }

    pub(super) fn claiming(mut self, claim: u8) -> Self {
        self.claim = Some(claim);
        self
    }

    pub(super) fn at_least(mut self, min: usize) -> Self {
        self.min = min;
        self
    }

    pub(super) fn drawn(mut self, layout: Layout) -> Self {
        self.layout = layout;
        self
    }
}

pub(super) struct Board<'a> {
    pub state: &'a SharedState,
    pub pool: &'a Pool,
    pub locale: &'a str,
    pub catalog: &'a Catalog,
    pub viewer: &'a Viewer,
    pub ctx: &'a Context,
    /// Every title the viewer has not watched, dropped or left in flight, the
    /// best fit first.
    pub ranked: Vec<Scored<'a>>,
}

const NEW_FOR_DAYS: i64 = 14;
const DAY: i64 = 86_400;
const ACCLAIMED: f32 = 0.78;
const TRENDING: f32 = 0.5;

impl<'a> Board<'a> {
    pub(super) fn new(
        state: &'a SharedState,
        pool: &'a Pool,
        locale: &'a str,
        catalog: &'a Catalog,
        viewer: &'a Viewer,
        ctx: &'a Context,
    ) -> Self {
        let in_flight: HashSet<&str> = ctx.in_progress.iter().map(String::as_str).collect();
        let open = catalog.titles.iter().filter(|title| {
            let id = title.facts.id.as_str();
            !viewer.taste.seen.contains(id) && !in_flight.contains(id)
        });
        Self {
            state,
            pool,
            locale,
            catalog,
            viewer,
            ctx,
            ranked: rank(&viewer.signals(), open),
        }
    }

    pub(super) fn t(&self, key: &str, vars: &[(&str, &str)]) -> String {
        i18n::t(self.locale, key, vars)
    }

    pub(super) fn ids(scored: impl IntoIterator<Item = &'a Title>, n: usize) -> Vec<String> {
        scored
            .into_iter()
            .take(n)
            .map(|title| title.facts.id.clone())
            .collect()
    }

    /// One line on why `title` is offered to this viewer, when there is one
    /// worth saying.
    pub(super) fn why(&self, title: &Title) -> Option<String> {
        let id = &title.facts.id;
        if self.viewer.taste.saved.contains(id) {
            return Some(self.t("content.noteSaved", &[]));
        }
        if self.viewer.taste.affinity(title) > 0.0 {
            if let Some(line) = self.viewer.taste.strongest(title).and_then(|f| self.for_its(title, f)) {
                return Some(line);
            }
        }
        if title.facts.added_at > self.viewer.now - NEW_FOR_DAYS * DAY {
            return Some(self.t("content.noteNew", &[]));
        }
        if self.viewer.social.get(id).copied().unwrap_or(0.0) >= TRENDING {
            return Some(self.t("content.noteTrending", &[]));
        }
        (title.facts.rating.is_some() && quality(title) >= ACCLAIMED)
            .then(|| self.t("content.noteAcclaimed", &[]))
    }

    fn for_its(&self, title: &Title, feature: &Feature) -> Option<String> {
        match feature {
            Feature::Genre(id) => {
                let genre = genre::label(self.locale, *id)?;
                Some(self.t("content.noteGenre", &[("genre", &genre)]))
            }
            Feature::NamedGenre(name) => Some(self.t("content.noteGenre", &[("genre", name)])),
            Feature::Cast(key) => {
                let name = spelled(&title.facts.cast, key)?;
                Some(self.t("content.noteWith", &[("name", name)]))
            }
            Feature::Director(key) => {
                let name = spelled(&title.facts.directors, key)?;
                Some(self.t("content.noteFrom", &[("name", name)]))
            }
            Feature::Decade(_) | Feature::Show(_) => None,
        }
    }
}

/// The spelling a credit carries for the person a feature keys.
pub(super) fn spelled<'n>(names: &'n [String], key: &str) -> Option<&'n str> {
    names
        .iter()
        .find(|name| person_key(name) == key)
        .map(String::as_str)
}
