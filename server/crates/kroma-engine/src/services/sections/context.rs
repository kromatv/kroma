//! The signals the generator selects sections off: *when* it is, plus a light
//! read of the viewer. Built once per `/api/home` request.

use time::{OffsetDateTime, Weekday};

use crate::db::{self, Pool};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PartOfDay {
    Morning,
    Afternoon,
    Evening,
    LateNight,
}

pub struct Context {
    pub month: u8,
    pub weekday: Weekday,
    pub part_of_day: PartOfDay,
    pub last_played: Option<String>,
    // Recent distinct watched ids: the taste window for the "For You" centroid.
    pub watched: Vec<String>,
}

impl Context {
    pub fn build(pool: &Pool, user_id: &str) -> Self {
        let now = OffsetDateTime::now_utc();
        let part_of_day = match now.hour() {
            5..=11 => PartOfDay::Morning,
            12..=17 => PartOfDay::Afternoon,
            18..=22 => PartOfDay::Evening,
            _ => PartOfDay::LateNight,
        };
        Self {
            month: u8::from(now.month()),
            weekday: now.weekday(),
            part_of_day,
            last_played: db::last_played(pool, user_id).ok().flatten(),
            watched: db::recent_watched_ids(pool, user_id).unwrap_or_default(),
        }
    }

    pub fn is_weekend(&self) -> bool {
        matches!(self.weekday, Weekday::Saturday | Weekday::Sunday)
    }

    pub fn is_evening(&self) -> bool {
        matches!(self.part_of_day, PartOfDay::Evening | PartOfDay::LateNight)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(weekday: Weekday, part: PartOfDay) -> Context {
        Context { month: 1, weekday, part_of_day: part, last_played: None, watched: Vec::new() }
    }

    #[test]
    fn is_weekend_only_saturday_and_sunday() {
        assert!(ctx(Weekday::Saturday, PartOfDay::Morning).is_weekend());
        assert!(ctx(Weekday::Sunday, PartOfDay::Morning).is_weekend());
        assert!(!ctx(Weekday::Monday, PartOfDay::Morning).is_weekend());
        assert!(!ctx(Weekday::Friday, PartOfDay::Morning).is_weekend());
    }

    #[test]
    fn is_evening_covers_evening_and_late_night() {
        assert!(ctx(Weekday::Monday, PartOfDay::Evening).is_evening());
        assert!(ctx(Weekday::Monday, PartOfDay::LateNight).is_evening());
        assert!(!ctx(Weekday::Monday, PartOfDay::Morning).is_evening());
        assert!(!ctx(Weekday::Monday, PartOfDay::Afternoon).is_evening());
    }
}
