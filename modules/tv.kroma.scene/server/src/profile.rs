use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::Quality;

/// Qualities a profile ranks as equal. A tier that is not allowed is still
/// listed, so the editor can switch it back on in place.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityTier {
    #[serde(default)]
    pub name: Option<String>,
    pub qualities: Vec<Quality>,
    pub allowed: bool,
}

/// What a title is judged by. `tiers` runs best first; `format_scores` is keyed
/// by custom format id, and a format it does not name scores zero.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityProfile {
    pub id: String,
    pub name: String,
    pub tiers: Vec<QualityTier>,
    pub cutoff: Quality,
    pub upgrades_allowed: bool,
    #[serde(default)]
    pub format_scores: BTreeMap<String, i32>,
    #[serde(default)]
    pub min_format_score: i32,
    #[serde(default)]
    pub upgrade_until_score: i32,
    #[serde(default = "one")]
    pub min_upgrade_increment: i32,
    #[serde(default)]
    pub must_contain: Vec<String>,
    #[serde(default)]
    pub must_not_contain: Vec<String>,
    #[serde(default)]
    pub min_seeders: u32,
    #[serde(default)]
    pub add_beside: bool,
}

fn one() -> i32 {
    1
}

impl QualityProfile {
    /// How good `quality` is in this profile, higher being better, or `None`
    /// when the profile does not allow it.
    pub fn rank(&self, quality: Quality) -> Option<u32> {
        self.position(quality)
            .filter(|&index| self.tiers[index].allowed)
            .map(|index| self.rank_of(index))
    }

    /// The rank a file must reach for quality upgrades to stop.
    pub fn cutoff_rank(&self) -> u32 {
        self.position(self.cutoff)
            .map_or(u32::MAX, |index| self.rank_of(index))
    }

    pub fn score_of(&self, format_id: &str) -> i32 {
        self.format_scores.get(format_id).copied().unwrap_or(0)
    }

    /// Refuses a profile that names a quality twice, allows nothing, or cuts
    /// off at a quality it does not allow.
    pub fn validate(&self) -> Result<(), String> {
        let mut seen = HashSet::new();
        for quality in self.tiers.iter().flat_map(|tier| &tier.qualities) {
            if !seen.insert(*quality) {
                return Err(format!("{} is listed twice", quality.id()));
            }
        }
        if !self
            .tiers
            .iter()
            .any(|tier| tier.allowed && !tier.qualities.is_empty())
        {
            return Err("the profile allows no quality".into());
        }
        if self.rank(self.cutoff).is_none() {
            return Err(format!("the cutoff {} is not allowed", self.cutoff.id()));
        }
        if self.name.trim().is_empty() {
            return Err("the profile has no name".into());
        }
        Ok(())
    }

    fn position(&self, quality: Quality) -> Option<usize> {
        self.tiers
            .iter()
            .position(|tier| tier.qualities.contains(&quality))
    }

    fn rank_of(&self, index: usize) -> u32 {
        (self.tiers.len() - index) as u32
    }
}

/// How big a quality may be, in megabytes per minute of runtime, so one limit
/// fits a 22-minute episode and a three-hour film.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeLimit {
    pub quality: Quality,
    #[serde(default)]
    pub min: f64,
    #[serde(default)]
    pub preferred: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
}

/// The size limits for films and for episodes, and the runtimes, in minutes,
/// assumed when the metadata gives none.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sizes {
    pub movie: Vec<SizeLimit>,
    pub episode: Vec<SizeLimit>,
    pub movie_runtime: u32,
    pub episode_runtime: u32,
}

impl Sizes {
    pub fn limit(&self, quality: Quality, movie: bool) -> Option<&SizeLimit> {
        let table = if movie { &self.movie } else { &self.episode };
        table.iter().find(|limit| limit.quality == quality)
    }
}
