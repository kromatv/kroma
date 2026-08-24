//! The themed-section "phrase bank" the breadth + creativity source. Each entry
//! is a free-text vibe the embedding model matches against the library; a phrase
//! only becomes a visible section when it actually has enough strong hits (the
//! generator's quality gate). Seasonal/daypart gates decide *eligibility*; the
//! embeddings decide *which* of the eligible ones resonate with this library.
//!
//! Grow this list to add sections no code changes. (A future LLM step could
//! author new phrases straight into this bank.)

use super::context::Context;

/// When a phrase is eligible, beyond any month gate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum When {
    Always,
    // Evening / late-night only.
    Evening,
    // Weekends only.
    Weekend,
}

pub struct Phrase {
    // Slug → section id `themed:<key>`.
    pub key: &'static str,
    // i18n key for the localized row title.
    pub title_key: &'static str,
    // The vibe the embedding model ranks titles against.
    pub query: &'static str,
    // Seasonal gate: only eligible in these months (1–12). `None` = any month.
    pub months: Option<&'static [u8]>,
    pub when: When,
}

impl Phrase {
    fn eligible(&self, ctx: &Context) -> bool {
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
}

/// Eligible phrases for the current context, in declaration order (seasonal ones
/// lead). The generator then resolves + quality-gates them.
pub fn eligible(ctx: &Context) -> Vec<&'static Phrase> {
    BANK.iter().filter(|p| p.eligible(ctx)).collect()
}

const BANK: &[Phrase] = &[
    Phrase {
        key: "christmas",
        title_key: "content.themeChristmas",
        query: "heartwarming christmas holiday movie",
        months: Some(&[12]),
        when: When::Always,
    },
    Phrase {
        key: "halloween",
        title_key: "content.themeHalloween",
        query: "halloween horror scary movie",
        months: Some(&[10]),
        when: When::Always,
    },
    Phrase {
        key: "cozy-autumn",
        title_key: "content.themeCozyAutumn",
        query: "cozy atmospheric autumn drama",
        months: Some(&[9, 10, 11]),
        when: When::Always,
    },
    Phrase {
        key: "summer",
        title_key: "content.themeSummer",
        query: "summer road trip adventure movie",
        months: Some(&[6, 7, 8]),
        when: When::Always,
    },
    Phrase {
        key: "action",
        title_key: "content.themeAction",
        query: "high octane action movie",
        months: None,
        when: When::Always,
    },
    Phrase {
        key: "feel-good",
        title_key: "content.themeFeelGood",
        query: "feel-good uplifting comedy",
        months: None,
        when: When::Always,
    },
    Phrase {
        key: "heist",
        title_key: "content.themeHeist",
        query: "clever heist crew robbery thriller",
        months: None,
        when: When::Always,
    },
    Phrase {
        key: "true-story",
        title_key: "content.themeTrueStory",
        query: "based on a true story biographical drama",
        months: None,
        when: When::Always,
    },
    Phrase {
        key: "tearjerker",
        title_key: "content.themeTearjerker",
        query: "emotional heartbreaking tearjerker drama",
        months: None,
        when: When::Always,
    },
    Phrase {
        key: "mind-bending",
        title_key: "content.themeMindBending",
        query: "mind-bending surreal science fiction",
        months: None,
        when: When::Evening,
    },
    Phrase {
        key: "neon-night",
        title_key: "content.themeNeonNight",
        query: "neon-soaked night drive crime thriller",
        months: None,
        when: When::Evening,
    },
    Phrase {
        key: "thriller",
        title_key: "content.themeThriller",
        query: "edge of your seat suspense thriller",
        months: None,
        when: When::Evening,
    },
    Phrase {
        key: "adventure",
        title_key: "content.themeAdventure",
        query: "epic adventure fantasy quest",
        months: None,
        when: When::Weekend,
    },
];

#[cfg(test)]
mod tests {
    use super::super::context::{Context, PartOfDay};
    use super::*;
    use time::Weekday;

    fn ctx(month: u8, weekday: Weekday, part: PartOfDay) -> Context {
        Context {
            month,
            weekday,
            part_of_day: part,
            last_played: None,
            watched: Vec::new(),
        }
    }

    #[test]
    fn phrase_eligible_respects_month_and_when_gates() {
        // Christmas: December only, always-on within the month.
        let christmas = &BANK[0];
        assert_eq!(christmas.key, "christmas");
        assert!(christmas.eligible(&ctx(12, Weekday::Monday, PartOfDay::Morning)));
        assert!(!christmas.eligible(&ctx(6, Weekday::Monday, PartOfDay::Morning)));

        // Evening-gated phrase needs an evening/late-night daypart.
        let evening = BANK.iter().find(|p| p.when == When::Evening).unwrap();
        assert!(evening.eligible(&ctx(3, Weekday::Monday, PartOfDay::Evening)));
        assert!(!evening.eligible(&ctx(3, Weekday::Monday, PartOfDay::Morning)));

        // Weekend-gated phrase needs Sat/Sun.
        let weekend = BANK.iter().find(|p| p.when == When::Weekend).unwrap();
        assert!(weekend.eligible(&ctx(3, Weekday::Saturday, PartOfDay::Morning)));
        assert!(!weekend.eligible(&ctx(3, Weekday::Wednesday, PartOfDay::Morning)));
    }

    #[test]
    fn eligible_returns_in_season_and_evergreen_only() {
        // December weekday afternoon.
        let keys: Vec<&str> = eligible(&ctx(12, Weekday::Wednesday, PartOfDay::Afternoon))
            .iter()
            .map(|p| p.key)
            .collect();
        assert!(keys.contains(&"christmas")); // in season
        assert!(keys.contains(&"action")); // always-on evergreen
        assert!(!keys.contains(&"halloween")); // October only
        assert!(!keys.contains(&"adventure")); // weekend only
        assert!(!keys.contains(&"mind-bending")); // evening only

        // Saturday summer evening.
        let keys: Vec<&str> = eligible(&ctx(7, Weekday::Saturday, PartOfDay::Evening))
            .iter()
            .map(|p| p.key)
            .collect();
        assert!(keys.contains(&"summer")); // months 6-8
        assert!(keys.contains(&"adventure")); // weekend
        assert!(keys.contains(&"thriller")); // evening
        assert!(!keys.contains(&"christmas")); // December only
        assert!(!keys.contains(&"cozy-autumn")); // Sep-Nov only
    }
}
