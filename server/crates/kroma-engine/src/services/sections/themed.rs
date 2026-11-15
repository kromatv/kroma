//! The discretionary rows: the themes in season, the rows a model named for
//! this viewer, and the collections it curated for everyone.

use std::collections::{HashMap, HashSet};

use crate::db;
use crate::services::embeddings;
use crate::services::reco::rank::{rank, spread};
use crate::services::reco::{Scored, Signals};

use super::board::{Board, Draft, CLAIM_THEME, FETCH, MIN_ITEMS};
use super::generate;
use super::themes::{self, Theme};

const MAX_THEMED: usize = 3;
const MAX_AI: usize = 2;
const MAX_CURATED: usize = 2;
const MIN_THEME_ITEMS: usize = MIN_ITEMS + 1;
const SAID_IN_TITLE: f32 = 0.15;
const SEASONAL_LEAD: f32 = 1.0;
const HEAD: usize = 5;

impl Board<'_> {
    /// The themes worth a row today, the seasonal ones first, then the ones
    /// whose best members suit the viewer most.
    pub(super) fn themes(&self) -> Vec<Draft> {
        let floor = embeddings::relevance_floor(&self.state.embedder);
        let embeds = floor < 1.0;
        let mut rows: Vec<(f32, Draft)> = themes::eligible(self.ctx)
            .into_iter()
            .filter(|theme| embeds || !theme.is_a_mood())
            .filter_map(|theme| self.theme(theme, embeds.then_some(floor)))
            .collect();
        rows.sort_by(|a, b| b.0.total_cmp(&a.0).then_with(|| a.1.id.cmp(&b.1.id)));
        rows.into_iter().take(MAX_THEMED).map(|(_, draft)| draft).collect()
    }

    fn theme(&self, theme: &Theme, floor: Option<f32>) -> Option<(f32, Draft)> {
        let pool = self.ranked.iter().map(|s| s.title);
        let mut members = theme.members(pool, &self.state.search);
        if members.len() < MIN_THEME_ITEMS {
            return None;
        }
        let near = self.near(theme, floor);
        if let (true, Some(floor)) = (theme.is_a_mood(), floor) {
            members.retain(|(title, _)| near.get(&title.facts.id).is_some_and(|c| *c >= floor));
        }
        let strength: HashMap<&str, f32> = members
            .iter()
            .map(|(title, strength)| (title.facts.id.as_str(), *strength))
            .collect();
        let signals = Signals {
            vectors: &near,
            ..self.viewer.signals()
        };
        let mut scored: Vec<Scored> = rank(&signals, members.iter().map(|(title, _)| *title));
        for entry in &mut scored {
            let said = strength.get(entry.title.facts.id.as_str()).copied().unwrap_or(1.0);
            entry.score *= 1.0 - SAID_IN_TITLE + SAID_IN_TITLE * said;
        }
        scored.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.title.facts.id.cmp(&b.title.facts.id)));
        if scored.len() < MIN_THEME_ITEMS {
            return None;
        }
        let head = scored.iter().take(HEAD).map(|s| s.score).sum::<f32>() / HEAD as f32;
        let lead = if theme.seasonal() { SEASONAL_LEAD } else { 0.0 };
        let draft = Draft::rail(
            format!("themed:{}", theme.key),
            self.t(theme.title_key, &[]),
            Self::ids(spread(&scored, FETCH), FETCH),
        )
        .at_least(MIN_THEME_ITEMS)
        .claiming(CLAIM_THEME);
        Some((head + lead, draft))
    }

    fn near(&self, theme: &Theme, floor: Option<f32>) -> HashMap<String, f32> {
        let (Some(vibe), Some(_)) = (theme.vibe, floor) else {
            return HashMap::new();
        };
        let query = embeddings::embed(&self.state.embedder, vibe);
        if query.is_empty() {
            return HashMap::new();
        }
        self.state
            .vectors
            .nearest(&query, usize::MAX, &HashSet::new())
            .into_iter()
            .collect()
    }

    /// Rows a model named for this viewer. The model only names a row and its
    /// genres; the members are catalogue titles of those genres, in the order
    /// the embedder puts them.
    pub(super) fn authored(&self) -> Vec<Draft> {
        let floor = embeddings::relevance_floor(&self.state.embedder);
        let open: HashSet<&str> = self.ranked.iter().map(|s| s.title.facts.id.as_str()).collect();
        generate::load(self.pool, &self.viewer.user_id)
            .into_iter()
            .filter(|row| !row.genres.is_empty())
            .map(|row| {
                let query = embeddings::embed(&self.state.embedder, &row.query);
                let near = self.state.vectors.nearest(&query, FETCH * 2, &HashSet::new());
                let ids: Vec<String> = db::keep_shelf(self.pool, near, &row.genres, row.form.kinds())
                    .into_iter()
                    .filter(|(id, score)| *score >= floor && open.contains(id.as_str()))
                    .map(|(id, _)| id)
                    .collect();
                let mut draft = Draft::rail(
                    format!("ai:{}", row.key),
                    row.title.get(self.locale).to_string(),
                    ids,
                );
                let reason = row.reason.get(self.locale);
                draft.reason = (!reason.is_empty()).then(|| reason.to_string());
                draft.claiming(CLAIM_THEME)
            })
            .take(MAX_AI)
            .collect()
    }

    /// Collections curated for everyone, a different pair each day.
    pub(super) fn curated(&self) -> Vec<Draft> {
        super::curated_rows(self.pool, self.locale, MAX_CURATED)
            .into_iter()
            .map(|(key, title, reason, ids)| {
                let mut draft = Draft::rail(format!("curated:{key}"), title, ids);
                draft.reason = reason;
                draft.claiming(CLAIM_THEME)
            })
            .collect()
    }
}
