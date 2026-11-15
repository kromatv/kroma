//! How many output tokens a reply written once per language is given.

use crate::i18n;
use crate::services::settings::{self, Settings};

const UNSET: i64 = 900;
const CEILING: i64 = 8192;
const SIZED_FOR: i64 = 2;

/// The output budget of a reply that carries text in `languages` languages:
/// `configured`, never under `floor`, as it stands for two of them and growing
/// in proportion past that. Never over 8192, which no budget went past before
/// and some models refuse to exceed.
pub fn reply_budget(configured: i64, floor: i64, languages: usize) -> u32 {
    let sized = configured.clamp(floor, CEILING);
    let languages = i64::try_from(languages).unwrap_or(i64::MAX).max(SIZED_FOR);
    let scaled = sized.saturating_mul(languages) / SIZED_FOR;
    u32::try_from(scaled.min(CEILING)).unwrap_or(u32::MAX)
}

/// [`reply_budget`] for the default provider's setting and the languages the
/// server keeps content in.
pub fn localized_reply_budget(settings: &Settings, floor: i64) -> u32 {
    let configured = settings::default_provider(settings).map_or(UNSET, |p| p.max_tokens);
    reply_budget(configured, floor, i18n::content_locales().len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_languages_keep_the_budget_they_always_had() {
        assert_eq!(reply_budget(900, 64, 2), 900);
        assert_eq!(reply_budget(900, 4096, 2), 4096);
        assert_eq!(reply_budget(20_000, 64, 2), 8192);
    }

    #[test]
    fn five_languages_are_given_the_room_of_five() {
        assert_eq!(reply_budget(900, 64, 5), 2250);
        assert_eq!(reply_budget(1200, 64, 5), 3000);
    }

    #[test]
    fn a_budget_never_grows_past_the_ceiling() {
        assert_eq!(reply_budget(900, 4096, 5), 8192);
        assert_eq!(reply_budget(900, 64, 1000), 8192);
    }

    #[test]
    fn a_single_language_is_not_given_less_than_two() {
        assert_eq!(reply_budget(900, 64, 1), 900);
        assert_eq!(reply_budget(0, 64, 0), 64);
    }
}
