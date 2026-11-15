//! One viewer's taste, read off what they did: a finished film counts for it,
//! a rewatched one for more, one dropped in the first minutes against it.

use std::collections::{HashMap, HashSet};

use crate::db::Engagement;

use super::catalog::{Catalog, Feature, Title};

const DAY: i64 = 86_400;
const HALF_LIFE_DAYS: f32 = 90.0;
const FADED_FLOOR: f32 = 0.35;

const FINISHED: f32 = 1.0;
const REWATCHED: f32 = 0.5;
const SAVED: f32 = 0.5;
const HALFWAY: f32 = 0.5;
const DROPPED: f32 = -0.4;
const DROPPED_BEFORE: f32 = 0.25;
const SETTLED_AFTER_DAYS: i64 = 2;
const SHOW_CEILING: f32 = 1.4;
const EPISODES_TO_CONVINCE: f32 = 3.0;
const SHOW_SAMPLED_AND_LEFT: f32 = -0.3;
const SHOW_SETTLED_AFTER_DAYS: i64 = 7;

/// How much one title counts for (above zero) or against (below) a viewer's
/// taste. Zero for one they only just started.
pub fn weight(engagement: &Engagement, show: bool, now: i64) -> f32 {
    let idle_days = (now - engagement.last_at).max(0) / DAY;
    let raw = if show {
        show_weight(engagement, idle_days)
    } else {
        movie_weight(engagement, idle_days)
    };
    let saved = if engagement.listed { SAVED } else { 0.0 };
    let raw = if raw < 0.0 { raw } else { raw.max(saved) };
    raw * fade(idle_days)
}

fn movie_weight(e: &Engagement, idle_days: i64) -> f32 {
    if e.finished > 0 {
        return FINISHED + if e.plays > 1 { REWATCHED } else { 0.0 };
    }
    if e.furthest >= HALFWAY {
        return HALFWAY;
    }
    let dropped = e.started > 0 && e.furthest < DROPPED_BEFORE && idle_days >= SETTLED_AFTER_DAYS;
    if dropped {
        DROPPED
    } else {
        0.0
    }
}

fn show_weight(e: &Engagement, idle_days: i64) -> f32 {
    if e.finished == 0 {
        let left = e.started > 0 && idle_days >= SHOW_SETTLED_AFTER_DAYS;
        return if left { SHOW_SAMPLED_AND_LEFT } else { 0.0 };
    }
    SHOW_CEILING * (1.0 - (-(e.finished as f32) / EPISODES_TO_CONVINCE).exp())
}

fn fade(idle_days: i64) -> f32 {
    FADED_FLOOR + (1.0 - FADED_FLOOR) * 0.5f32.powf(idle_days as f32 / HALF_LIFE_DAYS)
}

/// What a viewer likes, as weights over the catalogue's features, with the
/// titles it was read from.
#[derive(Debug, Default)]
pub struct Taste {
    features: HashMap<Feature, f32>,
    norm: f32,
    /// Titles that counted for the taste, the strongest first.
    pub liked: Vec<(String, f32)>,
    /// Titles a recommendation must not offer again: watched, in flight or
    /// dropped. A title only saved is not among them.
    pub seen: HashSet<String>,
    pub saved: HashSet<String>,
    last_at: HashMap<String, i64>,
}

impl Taste {
    pub fn read(catalog: &Catalog, history: &HashMap<String, Engagement>, now: i64) -> Self {
        let mut taste = Self::default();
        for (id, engagement) in history {
            let Some(title) = catalog.get(id) else {
                continue;
            };
            taste.last_at.insert(id.clone(), engagement.last_at);
            if engagement.listed {
                taste.saved.insert(id.clone());
            }
            if engagement.started > 0 || engagement.plays > 0 {
                taste.seen.insert(id.clone());
            }
            let weight = weight(engagement, title.facts.show, now);
            if weight == 0.0 {
                continue;
            }
            for (feature, value) in &title.features {
                *taste.features.entry(feature.clone()).or_default() += weight * value;
            }
            if weight > 0.0 {
                taste.liked.push((id.clone(), weight));
            }
        }
        taste.liked.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        taste.norm = taste.features.values().map(|w| w * w).sum::<f32>().sqrt();
        taste
    }

    pub fn is_blank(&self) -> bool {
        self.norm == 0.0
    }

    pub fn last_at(&self, id: &str) -> i64 {
        self.last_at.get(id).copied().unwrap_or(0)
    }

    /// How well a title fits, on -1..1: the cosine between it and the taste.
    pub fn affinity(&self, title: &Title) -> f32 {
        if self.norm == 0.0 {
            return 0.0;
        }
        let dot: f32 = title
            .features
            .iter()
            .map(|(feature, value)| value * self.features.get(feature).copied().unwrap_or(0.0))
            .sum();
        dot / self.norm
    }

    /// The feature of `title` that counts most for this viewer, when one does.
    pub fn strongest<'a>(&self, title: &'a Title) -> Option<&'a Feature> {
        title
            .features
            .iter()
            .map(|(feature, value)| (feature, value * self.features.get(feature).copied().unwrap_or(0.0)))
            .filter(|(feature, pull)| *pull > 0.0 && !matches!(feature, Feature::Show(_) | Feature::Decade(_)))
            .max_by(|a, b| a.1.total_cmp(&b.1).then_with(|| b.0.cmp(a.0)))
            .map(|(feature, _)| feature)
    }

    /// The features the viewer leans to, the strongest first, kept to the ones
    /// at least `support` liked titles carry: one film is not a taste.
    pub fn leanings(
        &self,
        catalog: &Catalog,
        support: usize,
        wanted: impl Fn(&Feature) -> bool,
    ) -> Vec<(Feature, f32)> {
        let mut carried: HashMap<&Feature, usize> = HashMap::new();
        for (id, _) in &self.liked {
            let Some(title) = catalog.get(id) else { continue };
            for (feature, _) in &title.features {
                *carried.entry(feature).or_default() += 1;
            }
        }
        let mut out: Vec<(Feature, f32)> = self
            .features
            .iter()
            .filter(|(feature, weight)| {
                **weight > 0.0 && wanted(feature) && carried.get(feature).copied().unwrap_or(0) >= support
            })
            .map(|(feature, weight)| (feature.clone(), *weight))
            .collect();
        out.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        out
    }
}

#[cfg(test)]
mod tests;
