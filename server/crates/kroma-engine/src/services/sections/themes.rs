//! The themed rows: a row named after a mood or a season. A theme is a RULE
//! before it is a ranking: a title is in only when its genres allow it and,
//! where the theme names something a genre cannot (Christmas, a heist), when
//! its own title or synopsis says so. An embedder may order what passed; it
//! never lets anything in.

use std::collections::HashMap;

use super::context::Context;
use crate::services::reco::Title;
use crate::services::search::SearchEngine;
use crate::services::vocab;

/// When a theme is eligible, beyond any month gate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum When {
    Always,
    Evening,
    Weekend,
}

pub struct Theme {
    /// Slug → section id `themed:<key>`.
    pub key: &'static str,
    pub title_key: &'static str,
    /// Only in these months (1–12). `None` = any month.
    pub months: Option<&'static [u8]>,
    pub when: When,
    /// A member carries at least one of these genres. Empty = any genre.
    pub any: &'static [u32],
    /// And none of these.
    pub none: &'static [u32],
    /// And, when given, one of the words or phrases of this `vocab.*` key in a
    /// title or a synopsis. The key is read in every language the app ships,
    /// so a synopsis counts in whichever one it was stored.
    pub evidence: Option<&'static str>,
    /// What an embedder orders the members by. A theme with a vibe and no
    /// evidence is a mood no rule can check, so it stands only while an
    /// embedder answers, and only over what clears that embedder's own floor.
    pub vibe: Option<&'static str>,
}

impl Theme {
    pub fn eligible(&self, ctx: &Context) -> bool {
        if let Some(months) = self.months {
            if !months.contains(&ctx.month) {
                return false;
            }
        }
        match self.when {
            When::Always => true,
            When::Evening => ctx.is_evening(),
            When::Weekend => ctx.is_weekend(),
        }
    }

    pub fn seasonal(&self) -> bool {
        self.months.is_some()
    }

    /// Whether only an embedder can tell what belongs.
    pub fn is_a_mood(&self) -> bool {
        self.evidence.is_none() && self.vibe.is_some()
    }

    fn admits_genres(&self, title: &Title) -> bool {
        let wanted = self.any.is_empty() || self.any.iter().any(|g| title.has_genre(*g));
        wanted && !self.none.iter().any(|g| title.has_genre(*g))
    }

    /// The titles of `pool` that belong, each with how strongly it says so
    /// (1.0 where the theme asks for no evidence).
    pub fn members<'a>(
        &self,
        pool: impl IntoIterator<Item = &'a Title>,
        search: &SearchEngine,
    ) -> Vec<(&'a Title, f32)> {
        let said: Option<HashMap<String, f32>> = self.evidence.map(|key| {
            let wordings = vocab::words(key);
            let wordings: Vec<&str> = wordings.iter().map(String::as_str).collect();
            search.carrying(&wordings)
        });
        pool.into_iter()
            .filter(|title| self.admits_genres(title))
            .filter_map(|title| match &said {
                Some(said) => said.get(&title.facts.id).map(|strength| (title, *strength)),
                None => Some((title, 1.0)),
            })
            .collect()
    }
}

mod bank;

pub use bank::BANK;

/// Eligible themes for the current context, seasonal ones first.
pub fn eligible(ctx: &Context) -> Vec<&'static Theme> {
    let mut themes: Vec<&Theme> = BANK.iter().filter(|theme| theme.eligible(ctx)).collect();
    themes.sort_by_key(|theme| !theme.seasonal());
    themes
}

#[cfg(test)]
mod tests;
