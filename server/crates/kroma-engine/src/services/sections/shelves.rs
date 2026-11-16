//! The rows that list facts rather than recommend: what arrived, what gained
//! episodes, what the household is watching, what the viewer saved or loved.

use std::collections::HashMap;

use crate::db;
use crate::model::Layout;
use crate::services::reco::rank::quality;
use crate::services::reco::taste;

use super::board::{Board, Draft, FETCH, MIN_ITEMS};
use super::world;

const DAY: i64 = 86_400;
const NEW_EPISODES_FOR_DAYS: i64 = 21;
const TOP: usize = 9;
const MIN_SHOWS: usize = 3;
const MIN_RANKED: usize = 3;
const MIN_SAVED: usize = 2;
const LOVED: f32 = 0.9;
const AGAIN_AFTER_DAYS: i64 = 120;

impl Board<'_> {
    pub(super) fn recent_movies(&self) -> Option<Draft> {
        let ids = db::recently_added_ids(self.pool, FETCH).unwrap_or_default();
        Some(Draft::rail("recent", self.t("content.recentMovies", &[]), ids).factual())
    }

    pub(super) fn recent_shows(&self) -> Option<Draft> {
        let ids = db::recently_added_show_ids(self.pool, FETCH).unwrap_or_default();
        Some(
            Draft::rail("recent-shows", self.t("content.recentShows", &[]), ids)
                .factual()
                .at_least(MIN_SHOWS),
        )
    }

    /// Shows already in the library that gained episodes lately, the ones the
    /// viewer follows first, each saying what is new in it.
    pub(super) fn new_episodes(&self) -> Option<Draft> {
        let since = self.viewer.now - NEW_EPISODES_FOR_DAYS * DAY;
        let mut fed: Vec<db::FreshShow> = db::fresh_shows(self.pool, since, FETCH)
            .unwrap_or_default()
            .into_iter()
            .filter(|show| show.first_at < since)
            .collect();
        let followed = |show: &db::FreshShow| {
            self.viewer
                .history
                .get(&show.show_id)
                .is_some_and(|e| e.started > 0 || e.listed)
        };
        fed.sort_by_key(|show| (!followed(show), std::cmp::Reverse(show.last_at)));
        let notes: HashMap<String, String> = fed
            .iter()
            .map(|show| (show.show_id.clone(), self.what_is_new(show)))
            .collect();
        let ids = fed.into_iter().map(|show| show.show_id).collect();
        let mut draft = Draft::rail("new-episodes", self.t("content.newEpisodes", &[]), ids)
            .factual()
            .drawn(Layout::Wide)
            .at_least(1);
        draft.notes = notes;
        Some(draft)
    }

    fn what_is_new(&self, show: &db::FreshShow) -> String {
        let season = show.season.to_string();
        if show.fresh == 1 {
            let episode = show.episode.to_string();
            return self.t(
                "content.noteEpisode",
                &[("season", &season), ("episode", &episode)],
            );
        }
        let count = show.fresh.to_string();
        self.t("content.noteNewEpisodes", &[("count", &count)])
    }

    /// What is trending, in order: what the household watched most this month
    /// when it is a household of several, then what the world is watching that
    /// the library holds.
    pub(super) fn trending(&self) -> Option<Draft> {
        let ids = world::blend(
            super::trending_ids(self.pool, TOP),
            self.viewer.household,
            &self.viewer.world,
            TOP,
        );
        Some(
            Draft::rail("trending", self.t("content.trending", &[]), ids)
                .factual()
                .drawn(Layout::Ranked)
                .at_least(MIN_RANKED),
        )
    }

    /// What the viewer saved and has not finished, the latest save first.
    pub(super) fn saved(&self) -> Option<Draft> {
        let mut waiting: Vec<(&String, i64)> = self
            .viewer
            .history
            .iter()
            .filter(|(id, e)| e.listed && e.finished == 0 && self.catalog.get(id).is_some())
            .map(|(id, e)| (id, e.last_at))
            .collect();
        waiting.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
        let ids = waiting.into_iter().map(|(id, _)| id.clone()).collect();
        Some(
            Draft::rail("my-list", self.t("nav.myList", &[]), ids)
                .factual()
                .at_least(MIN_SAVED),
        )
    }

    /// What the viewer loved long enough ago to want again.
    pub(super) fn again(&self) -> Option<Draft> {
        let before = self.viewer.now - AGAIN_AFTER_DAYS * DAY;
        let mut loved: Vec<(&String, f32)> = self
            .viewer
            .history
            .iter()
            .filter(|(_, e)| e.finished > 0 && e.last_at > 0 && e.last_at < before)
            .filter_map(|(id, e)| {
                let title = self.catalog.get(id)?;
                let weight = taste::weight(e, title.facts.show, e.last_at);
                (weight >= LOVED).then(|| (id, weight * quality(title)))
            })
            .collect();
        loved.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(b.0)));
        let ids = loved.into_iter().map(|(id, _)| id.clone()).take(FETCH).collect();
        Some(
            Draft::rail("watch-again", self.t("content.watchAgain", &[]), ids)
                .factual()
                .at_least(MIN_ITEMS + 1),
        )
    }
}
