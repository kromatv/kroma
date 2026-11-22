//! A profile's maturity ceiling: the oldest age it may watch, and the rating a
//! title is held to for that profile.

use serde::{Deserialize, Serialize};

use super::{AgeRating, CountryRatings, minimum_age, reader_rating};
use crate::metadata::Metadata;

/// One of the six levels a profile is held at, the ones Netflix uses. It reads
/// and writes as the oldest age it admits: `0` for All, `18` for 18+.
#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
)]
#[serde(try_from = "u8", into = "u8")]
pub enum MaturityLevel {
    All,
    Seven,
    Ten,
    Thirteen,
    Sixteen,
    #[default]
    Adult,
}

impl MaturityLevel {
    pub const ALL: [MaturityLevel; 6] = [
        MaturityLevel::All,
        MaturityLevel::Seven,
        MaturityLevel::Ten,
        MaturityLevel::Thirteen,
        MaturityLevel::Sixteen,
        MaturityLevel::Adult,
    ];

    pub const fn age(self) -> u8 {
        match self {
            MaturityLevel::All => 0,
            MaturityLevel::Seven => 7,
            MaturityLevel::Ten => 10,
            MaturityLevel::Thirteen => 13,
            MaturityLevel::Sixteen => 16,
            MaturityLevel::Adult => 18,
        }
    }

    /// The level whose age is exactly `age`, and `None` for any other age.
    pub fn of_age(age: u8) -> Option<MaturityLevel> {
        MaturityLevel::ALL
            .into_iter()
            .find(|level| level.age() == age)
    }

    /// All, 7+ and 10+, the levels Netflix groups as "Recommended for Kids".
    pub fn is_kids(self) -> bool {
        self <= MaturityLevel::Ten
    }
}

impl TryFrom<u8> for MaturityLevel {
    type Error = String;

    fn try_from(age: u8) -> Result<Self, Self::Error> {
        MaturityLevel::of_age(age).ok_or_else(|| format!("{age} is not a maturity level"))
    }
}

impl From<MaturityLevel> for u8 {
    fn from(level: MaturityLevel) -> u8 {
        level.age()
    }
}

/// What a profile is held to: its level, the country whose labels it reads,
/// and the server's metadata country a title borrows from first.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ceiling {
    pub level: MaturityLevel,
    pub reader: String,
    pub server: String,
}

impl Ceiling {
    /// At 18+ every title passes, rated or not.
    pub fn hides_nothing(&self) -> bool {
        self.level == MaturityLevel::Adult
    }

    /// The rating this profile's badge shows for a title rated `ratings`.
    pub fn shown(&self, ratings: &CountryRatings) -> Option<AgeRating> {
        reader_rating(ratings, &self.reader, &self.server)
    }

    /// Whether a title rated `ratings` passes. `legacy` is the one bare label a
    /// title enriched before every country was kept still carries, read under
    /// the server's country; it counts only when `ratings` is empty. Under a
    /// ceiling, a title with no age passes nothing.
    pub fn admits(&self, ratings: &CountryRatings, legacy: Option<&str>) -> bool {
        self.hides_nothing()
            || self
                .age_shown(ratings, legacy)
                .is_some_and(|age| age <= self.level.age())
    }

    /// [`Self::admits`] for a title's stored metadata; a title with none is
    /// unrated.
    pub fn admits_metadata(&self, meta: Option<&Metadata>) -> bool {
        match meta {
            Some(meta) => self.admits(&meta.ratings, meta.certification.as_deref()),
            None => self.hides_nothing(),
        }
    }

    /// Point `meta`'s badge, and the bare label older clients draw, at the
    /// rating this profile is shown. A title with no country kept is left as
    /// it was.
    pub fn relabel(&self, meta: &mut Metadata) {
        if meta.ratings.is_empty() {
            return;
        }
        meta.age_rating = self.shown(&meta.ratings);
        meta.certification = meta.age_rating.as_ref().map(|r| r.label.clone());
    }

    fn age_shown(&self, ratings: &CountryRatings, legacy: Option<&str>) -> Option<u8> {
        if ratings.is_empty() {
            return minimum_age(&self.server, legacy?);
        }
        let shown = self.shown(ratings)?;
        minimum_age(&shown.country, &shown.label)
    }
}

#[cfg(test)]
mod tests;
