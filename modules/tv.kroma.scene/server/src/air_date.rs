use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// The day a daily episode aired, which stands where a season and an episode
/// would be: `Show.2024.05.01.1080p.WEB`. Travels as `2024-05-01`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AirDate {
    pub year: u32,
    pub month: u32,
    pub day: u32,
}

impl AirDate {
    pub fn new(year: u32, month: u32, day: u32) -> Self {
        Self { year, month, day }
    }

    /// Reads `2024-05-01` or `2024.05.01`. The month and the day are the two
    /// digits a release name writes, never one.
    pub fn parse(text: &str) -> Option<Self> {
        let mut parts = text.trim().split(['-', '.']);
        let year = digits(parts.next()?, 4)?;
        let month = digits(parts.next()?, 2).filter(|month| (1..=12).contains(month))?;
        let day = digits(parts.next()?, 2).filter(|day| (1..=31).contains(day))?;
        parts.next().is_none().then(|| Self::new(year, month, day))
    }
}

fn digits(part: &str, width: usize) -> Option<u32> {
    if part.len() != width || !part.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    part.parse().ok()
}

impl fmt::Display for AirDate {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}

impl Serialize for AirDate {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for AirDate {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = String::deserialize(deserializer)?;
        AirDate::parse(&text)
            .ok_or_else(|| serde::de::Error::custom(format!("not an air date: {text}")))
    }
}
