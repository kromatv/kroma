use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// A spoken or written language, with its regional variant when one is known:
/// `fr-FR` is the France dub (VFF), `fr-CA` the Québec one (VFQ), `fr` a French
/// track of unstated origin. Travels as its tag.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Language {
    pub code: String,
    pub region: Option<String>,
}

impl Language {
    pub fn new(code: &str, region: Option<&str>) -> Self {
        Self {
            code: code.to_ascii_lowercase(),
            region: region.map(str::to_ascii_uppercase),
        }
    }

    /// Reads `fr`, `fr-CA` or `fr_CA`. Anything else is not a language tag.
    pub fn parse(tag: &str) -> Option<Self> {
        let mut parts = tag.trim().split(['-', '_']);
        let code = parts.next().filter(|c| is_alpha(c, 2..=3))?;
        let region = match parts.next() {
            Some(region) if is_alpha(region, 2..=2) || is_numeric_region(region) => Some(region),
            Some(_) => return None,
            None => None,
        };
        Some(Self::new(code, region))
    }

    /// True when this track answers for `wanted`: the same language, and the
    /// same region whenever `wanted` names one.
    pub fn satisfies(&self, wanted: &Language) -> bool {
        self.code == wanted.code
            && wanted
                .region
                .as_ref()
                .is_none_or(|region| self.region.as_ref() == Some(region))
    }
}

fn is_alpha(part: &str, len: std::ops::RangeInclusive<usize>) -> bool {
    len.contains(&part.len()) && part.chars().all(|c| c.is_ascii_alphabetic())
}

fn is_numeric_region(part: &str) -> bool {
    part.len() == 3 && part.chars().all(|c| c.is_ascii_digit())
}

impl fmt::Display for Language {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.region {
            Some(region) => write!(f, "{}-{region}", self.code),
            None => f.write_str(&self.code),
        }
    }
}

impl Serialize for Language {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for Language {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let tag = String::deserialize(deserializer)?;
        Language::parse(&tag)
            .ok_or_else(|| serde::de::Error::custom(format!("not a language tag: {tag}")))
    }
}
