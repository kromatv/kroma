//! The country whose age-rating label a TMDB language reads.

use crate::i18n;
use crate::services::settings::tmdb_region_of;

const FALLBACK_REGION: &str = "US";

pub(crate) fn country_of(language: &str, household: &str) -> String {
    i18n::region(language)
        .or_else(|| i18n::region(household))
        .or_else(|| i18n::region(tmdb_region_of(i18n::language(language))))
        .unwrap_or(FALLBACK_REGION)
        .to_ascii_uppercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_country_comes_from_the_language_tags_own_region() {
        assert_eq!(country_of("pt-PT", "fr-FR"), "PT");
        assert_eq!(country_of("en-US", "fr-FR"), "US");
        assert_eq!(country_of("zh-TW", "fr-FR"), "TW");
    }

    #[test]
    fn a_bare_language_takes_the_households_country() {
        assert_eq!(country_of("fr", "fr-CA"), "CA");
        assert_eq!(country_of("en", "fr-FR"), "FR");
    }

    #[test]
    fn a_bare_language_in_a_household_with_no_country_takes_the_one_tmdb_pairs_it_with() {
        assert_eq!(country_of("fr", "fr"), "FR");
        assert_eq!(country_of("ja", "ja"), "JP");
    }

    #[test]
    fn a_script_is_never_taken_for_a_country() {
        assert_eq!(country_of("zh-Hant", "zh-Hant"), "US");
    }

    #[test]
    fn a_language_tmdb_knows_no_region_for_falls_back_to_the_united_states() {
        assert_eq!(country_of("sv", "sv"), "US");
        assert_eq!(country_of("", ""), "US");
    }
}
