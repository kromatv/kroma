//! Ordering titles for one viewer: how well each fits their taste, blended
//! with what the title has going for it on its own, then spread out so a row
//! is not ten of the same thing.

use std::collections::{HashMap, HashSet};

use super::catalog::Title;
use super::taste::Taste;

const DAY: f32 = 86_400.0;

const W_TASTE: f32 = 0.50;
const W_QUALITY: f32 = 0.17;
const W_VECTOR: f32 = 0.13;
const W_SOCIAL: f32 = 0.10;
const W_FRESH: f32 = 0.10;

const UNRATED: f32 = 0.55;
const FRESH_HALF_LIFE_DAYS: f32 = 30.0;
const SAVED_BONUS: f32 = 0.08;
const DAILY_SWAY: f32 = 0.06;

/// Everything a ranking reads beyond the titles themselves.
pub struct Signals<'a> {
    pub taste: &'a Taste,
    /// Cosine of each title's embedding to what the viewer liked, when a
    /// module embeds titles. Absent entries carry no datum.
    pub vectors: &'a HashMap<String, f32>,
    /// What the household is watching, on 0..1.
    pub social: &'a HashMap<String, f32>,
    pub now: i64,
    /// Changes with the viewer and the day, so two people and two days do not
    /// get the same order out of the same scores.
    pub salt: u64,
}

#[derive(Debug, Clone, Copy)]
pub struct Scored<'a> {
    pub title: &'a Title,
    pub score: f32,
}

/// `pool` scored for the viewer, the best first.
pub fn rank<'a>(signals: &Signals, pool: impl IntoIterator<Item = &'a Title>) -> Vec<Scored<'a>> {
    let pool: Vec<&Title> = pool.into_iter().collect();
    let fits: Vec<f32> = pool.iter().map(|t| signals.taste.affinity(t)).collect();
    let taste_span = span(fits.iter().copied()).filter(|_| !signals.taste.is_blank());
    let vector_span = span(pool.iter().filter_map(|t| signals.vectors.get(&t.facts.id).copied()));

    let mut scored: Vec<Scored> = pool
        .iter()
        .zip(&fits)
        .map(|(title, fit)| {
            let id = &title.facts.id;
            let mut sum = W_QUALITY * quality(title)
                + W_FRESH * freshness(title.facts.added_at, signals.now)
                + W_SOCIAL * signals.social.get(id).copied().unwrap_or(0.0);
            let mut weight = W_QUALITY + W_FRESH + W_SOCIAL;
            if let Some((low, spread)) = taste_span {
                sum += W_TASTE * (fit - low) / spread;
                weight += W_TASTE;
            }
            if let (Some((low, spread)), Some(cosine)) = (vector_span, signals.vectors.get(id)) {
                sum += W_VECTOR * (cosine - low) / spread;
                weight += W_VECTOR;
            }
            let mut score = sum / weight;
            if signals.taste.saved.contains(id) {
                score += SAVED_BONUS;
            }
            score *= 1.0 + DAILY_SWAY * (sway(signals.salt, id) - 0.5);
            Scored { title, score }
        })
        .collect();
    scored.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.title.facts.id.cmp(&b.title.facts.id))
    });
    scored
}

fn span(values: impl Iterator<Item = f32>) -> Option<(f32, f32)> {
    let (low, high, count) = values.fold((f32::MAX, f32::MIN, 0usize), |(l, h, n), v| {
        (l.min(v), h.max(v), n + 1)
    });
    (count > 1 && high - low > f32::EPSILON).then_some((low, high - low))
}

pub fn quality(title: &Title) -> f32 {
    title
        .facts
        .rating
        .map_or(UNRATED, |r| (r / 10.0).clamp(0.0, 1.0))
}

pub fn freshness(added_at: i64, now: i64) -> f32 {
    if added_at <= 0 {
        return 0.0;
    }
    let age_days = (now - added_at).max(0) as f32 / DAY;
    0.5f32.powf(age_days / FRESH_HALF_LIFE_DAYS)
}

fn sway(salt: u64, id: &str) -> f32 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325 ^ salt;
    for byte in id.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    (hash >> 40) as f32 / (1u64 << 24) as f32
}

/// The salt of one viewer on one day.
pub fn salt(user_id: &str, day: i64) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in user_id.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash ^ (day as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15)
}

const SAMENESS_COST: f32 = 0.12;
const LOOK_BACK: usize = 3;
const WINDOW_FACTOR: usize = 3;

/// The best `n` of `ranked`, reordered so neighbours differ: each pick pays for
/// the genres it shares with the few picked just before it. The first pick is
/// always the best one.
pub fn spread<'a>(ranked: &[Scored<'a>], n: usize) -> Vec<&'a Title> {
    let mut window: Vec<Scored> = ranked.iter().take(n * WINDOW_FACTOR).copied().collect();
    let mut picked: Vec<&Title> = Vec::with_capacity(n);
    while picked.len() < n && !window.is_empty() {
        let recent = &picked[picked.len().saturating_sub(LOOK_BACK)..];
        let (best, _) = window
            .iter()
            .enumerate()
            .map(|(index, candidate)| {
                let sameness = recent
                    .iter()
                    .map(|earlier| shared_genres(earlier, candidate.title))
                    .fold(0.0, f32::max);
                (index, candidate.score - SAMENESS_COST * sameness)
            })
            .max_by(|a, b| a.1.total_cmp(&b.1).then_with(|| b.0.cmp(&a.0)))
            .expect("the window is not empty");
        picked.push(window.remove(best).title);
    }
    picked
}

fn shared_genres(a: &Title, b: &Title) -> f32 {
    let mine: HashSet<u32> = a.genres.iter().copied().collect();
    let theirs: HashSet<u32> = b.genres.iter().copied().collect();
    let union = mine.union(&theirs).count();
    if union == 0 {
        return 0.0;
    }
    mine.intersection(&theirs).count() as f32 / union as f32
}

/// What the rest of a household that watches what `user_id` watches also
/// watched, on 0..1. Empty for a household of one.
pub fn cowatched(plays: &[(String, String)], user_id: &str) -> HashMap<String, f32> {
    let mut by_user: HashMap<&str, HashSet<&str>> = HashMap::new();
    for (user, title) in plays {
        by_user.entry(user).or_default().insert(title);
    }
    let Some(mine) = by_user.get(user_id) else {
        return HashMap::new();
    };
    let mut scores: HashMap<String, f32> = HashMap::new();
    for (user, theirs) in &by_user {
        if *user == user_id {
            continue;
        }
        let common = mine.intersection(theirs).count() as f32;
        if common == 0.0 {
            continue;
        }
        let kinship = common / ((mine.len() * theirs.len()) as f32).sqrt();
        for title in theirs.difference(mine) {
            *scores.entry((*title).to_string()).or_default() += kinship;
        }
    }
    let top = scores.values().copied().fold(0.0, f32::max);
    if top > 0.0 {
        for score in scores.values_mut() {
            *score /= top;
        }
    }
    scores
}

#[cfg(test)]
mod tests;
