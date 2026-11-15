//! The rows read off one viewer's taste: what fits them best, what resembles
//! what they just finished, the genres and the people they lean to.

use std::collections::HashSet;

use crate::db;
use crate::model::Layout;
use crate::services::reco::rank::{quality, spread};
use crate::services::reco::{genre, Feature, Scored, Title};

use super::board::{
    spelled, Board, Draft, CLAIM_GENRE, CLAIM_PERSON, CLAIM_SEED, FETCH, MIN_ITEMS,
};

const HERO_PICKS: usize = 3;
const HERO_CAP: usize = 5;
const HERO_FETCH: usize = 10;
const HERO_SHARE: usize = 6;
const SPOTLIGHT_FROM: usize = 24;
const FRESH_FOR_DAYS: i64 = 45;
const DAY: i64 = 86_400;

const SEEDS: usize = 2;
const SEED_WEIGHT: f32 = 0.7;
const RESEMBLES: f32 = 0.05;

const GENRE_ROWS: usize = 3;
const PEOPLE_ROWS: usize = 2;
const LEANING_SUPPORT: usize = 2;
const MIN_PERSON_ITEMS: usize = 4;
const MIN_GENRE_ITEMS: usize = 6;

const ACCLAIMED: f32 = 0.78;
const SHORT_FILM_MS: i64 = 100 * 60_000;
const NOT_A_SHORT_MS: i64 = 40 * 60_000;

impl<'a> Board<'a> {
    fn presentable(&self) -> Vec<Scored<'a>> {
        let shown = |s: &&Scored| s.title.facts.has_backdrop && s.title.facts.has_overview;
        let stage: Vec<Scored> = self.ranked.iter().filter(shown).copied().collect();
        if stage.is_empty() {
            self.ranked.clone()
        } else {
            stage
        }
    }

    /// The few titles the page opens on: the best fits, the best of what just
    /// arrived, and what the household is watching.
    pub(super) fn hero(&self) -> Option<Draft> {
        let stage = self.presentable();
        let mut picks: Vec<&Title> = spread(&stage, HERO_PICKS);
        let fresh_since = self.viewer.now - FRESH_FOR_DAYS * DAY;
        let newest = stage.iter().find(|s| s.title.facts.added_at >= fresh_since);
        let trending = stage
            .iter()
            .filter(|s| self.viewer.social.contains_key(&s.title.facts.id))
            .max_by(|a, b| {
                let heat = |s: &Scored| self.viewer.social[&s.title.facts.id];
                heat(a).total_cmp(&heat(b))
            });
        picks.extend(newest.into_iter().chain(trending).map(|s| s.title));
        picks.extend(stage.iter().map(|s| s.title).take(HERO_FETCH));
        let mut seen = HashSet::new();
        picks.retain(|title| seen.insert(title.facts.id.as_str()));
        picks.truncate(HERO_FETCH);
        if picks.is_empty() {
            return None;
        }
        let mut draft = Draft::rail("hero", self.t("content.featured", &[]), Self::ids(picks.iter().copied(), HERO_FETCH))
            .drawn(Layout::Hero)
            .at_least(1);
        draft.cap = (self.ranked.len() / HERO_SHARE).clamp(1, HERO_CAP);
        for title in picks {
            if let Some(why) = self.why(title) {
                draft.notes.insert(title.facts.id.clone(), why);
            }
        }
        Some(draft)
    }

    /// One title given the width of the page, with why it was picked.
    pub(super) fn spotlight(&self) -> Option<Draft> {
        if self.ranked.len() < SPOTLIGHT_FROM {
            return None;
        }
        let picks: Vec<&Title> = self
            .presentable()
            .into_iter()
            .map(|s| s.title)
            .take(HERO_FETCH * 2)
            .collect();
        if picks.is_empty() {
            return None;
        }
        let mut draft = Draft::rail("spotlight", self.t("content.spotlight", &[]), Self::ids(picks.iter().copied(), usize::MAX))
            .drawn(Layout::Spotlight)
            .at_least(1);
        draft.cap = 1;
        for title in picks {
            if let Some(why) = self.why(title) {
                draft.notes.insert(title.facts.id.clone(), why);
            }
        }
        Some(draft)
    }

    pub(super) fn top_picks(&self) -> Option<Draft> {
        let picks = spread(&self.ranked, FETCH);
        Some(Draft::rail("for-you", self.t("content.forYou", &[]), Self::ids(picks, FETCH)))
    }

    /// "Because you watched X", for the latest titles the viewer clearly
    /// liked. A member shares a genre with X and resembles it: the row makes a
    /// claim about every title in it.
    pub(super) fn because(&self) -> Vec<Draft> {
        let mut seeds: Vec<&Title> = self
            .viewer
            .taste
            .liked
            .iter()
            .filter(|(_, weight)| *weight >= SEED_WEIGHT)
            .filter_map(|(id, _)| self.catalog.get(id))
            .filter(|title| self.viewer.taste.seen.contains(&title.facts.id))
            .collect();
        seeds.sort_by_key(|title| std::cmp::Reverse(self.viewer.taste.last_at(&title.facts.id)));
        seeds
            .into_iter()
            .take(SEEDS)
            .filter_map(|seed| {
                let name = db::get_title(self.pool, &seed.facts.id).ok()??.title;
                let mut kin: Vec<(&Title, f32)> = self
                    .ranked
                    .iter()
                    .filter(|s| seed.genres.is_empty() || seed.genres.iter().any(|g| s.title.has_genre(*g)))
                    .map(|s| (s.title, seed.resemblance(s.title), s.score))
                    .filter(|(_, resemblance, _)| *resemblance >= RESEMBLES)
                    .map(|(title, resemblance, score)| (title, 0.7 * resemblance + 0.3 * score))
                    .collect();
                kin.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.facts.id.cmp(&b.0.facts.id)));
                let ids = Self::ids(kin.into_iter().map(|(title, _)| title), FETCH);
                let heading = self.t("content.becauseYouWatched", &[("title", &name)]);
                Some(Draft::rail(format!("because:{}", seed.facts.id), heading, ids).claiming(CLAIM_SEED))
            })
            .collect()
    }

    /// One row per genre the viewer leans to, the strongest leaning first.
    pub(super) fn genres(&self) -> Vec<Draft> {
        self.viewer
            .taste
            .leanings(self.catalog, LEANING_SUPPORT, |f| matches!(f, Feature::Genre(_)))
            .into_iter()
            .filter_map(|(feature, _)| {
                let Feature::Genre(id) = feature else { return None };
                let name = genre::label(self.locale, id)?;
                let members = self.ranked.iter().map(|s| s.title).filter(|t| t.has_genre(id));
                let draft = Draft::rail(
                    format!("genre:{id}"),
                    self.t("content.genreForYou", &[("genre", &name)]),
                    Self::ids(members, FETCH),
                );
                Some(draft.at_least(MIN_GENRE_ITEMS).claiming(CLAIM_GENRE))
            })
            .take(GENRE_ROWS)
            .collect()
    }

    /// One row per actor or director the viewer keeps coming back to.
    pub(super) fn people(&self) -> Vec<Draft> {
        self.viewer
            .taste
            .leanings(self.catalog, LEANING_SUPPORT, |f| {
                matches!(f, Feature::Cast(_) | Feature::Director(_))
            })
            .into_iter()
            .filter_map(|(feature, _)| {
                let members: Vec<&Title> = self
                    .ranked
                    .iter()
                    .map(|s| s.title)
                    .filter(|title| title.weight_of(&feature) > 0.0)
                    .collect();
                let (key, heading) = match &feature {
                    Feature::Cast(key) => (key, "content.withPerson"),
                    Feature::Director(key) => (key, "content.fromPerson"),
                    _ => return None,
                };
                let name = members.iter().find_map(|title| {
                    spelled(&title.facts.cast, key).or_else(|| spelled(&title.facts.directors, key))
                })?;
                let draft = Draft::rail(
                    format!("person:{key}"),
                    self.t(heading, &[("name", name)]),
                    Self::ids(members.iter().copied(), FETCH),
                );
                Some(draft.at_least(MIN_PERSON_ITEMS).claiming(CLAIM_PERSON))
            })
            .take(PEOPLE_ROWS)
            .collect()
    }

    pub(super) fn acclaimed(&self) -> Option<Draft> {
        let members = self
            .ranked
            .iter()
            .map(|s| s.title)
            .filter(|title| title.facts.rating.is_some() && quality(title) >= ACCLAIMED);
        Some(
            Draft::rail("acclaimed", self.t("content.acclaimed", &[]), Self::ids(members, FETCH))
                .at_least(MIN_ITEMS + 1),
        )
    }

    /// Films short enough to start late: a weeknight row.
    pub(super) fn quick(&self) -> Option<Draft> {
        if !self.ctx.is_evening() || self.ctx.is_weekend() {
            return None;
        }
        let members = self.ranked.iter().map(|s| s.title).filter(|title| {
            !title.facts.show
                && title
                    .facts
                    .runtime_ms
                    .is_some_and(|ms| (NOT_A_SHORT_MS..=SHORT_FILM_MS).contains(&ms))
        });
        Some(
            Draft::rail("quick", self.t("content.quickWatch", &[]), Self::ids(members, FETCH))
                .at_least(MIN_ITEMS + 1),
        )
    }
}
