//! The age-rating block TMDB appends to a detail request, and every country's label in it.

use serde::Deserialize;

use crate::domain::CountryRatings;
use crate::i18n;
use crate::services::settings::tmdb_region_of;

const FALLBACK_REGION: &str = "US";

#[derive(Debug, Deserialize)]
pub(super) struct Certifications {
    #[serde(default)]
    results: Vec<CountryEntry>,
}

#[derive(Debug, Deserialize)]
struct CountryEntry {
    #[serde(default, rename = "iso_3166_1")]
    country: String,
    #[serde(default)]
    rating: Option<String>,
    #[serde(default)]
    release_dates: Vec<ReleaseDate>,
}

#[derive(Debug, Deserialize)]
struct ReleaseDate {
    #[serde(default)]
    certification: Option<String>,
}

impl Certifications {
    pub(super) fn every_country(&self) -> CountryRatings {
        self.results
            .iter()
            .filter(|entry| !entry.country.is_empty())
            .filter_map(|entry| Some((entry.country.clone(), entry.rating()?)))
            .collect()
    }
}

impl CountryEntry {
    fn rating(&self) -> Option<String> {
        self.rating
            .iter()
            .chain(
                self.release_dates
                    .iter()
                    .filter_map(|r| r.certification.as_ref()),
            )
            .map(|label| label.trim())
            .find(|label| !label.is_empty())
            .map(str::to_string)
    }
}

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

    fn parse(raw: &str) -> Certifications {
        serde_json::from_str(raw).unwrap()
    }

    fn countries(raw: &str) -> Vec<(String, String)> {
        parse(raw).every_country().into_iter().collect()
    }

    fn pairs(expected: &[(&str, &str)]) -> Vec<(String, String)> {
        expected
            .iter()
            .map(|(c, l)| (c.to_string(), l.to_string()))
            .collect()
    }

    #[test]
    fn a_movie_carries_the_rating_every_country_gave_it() {
        let got = countries(
            r#"{"results":[
                {"iso_3166_1":"FR","release_dates":[{"certification":"12"}]},
                {"iso_3166_1":"US","release_dates":[{"certification":"PG-13"}]}
            ]}"#,
        );

        assert_eq!(got, pairs(&[("FR", "12"), ("US", "PG-13")]));
    }

    #[test]
    fn a_show_carries_its_rating_on_the_country_itself() {
        let got = countries(r#"{"results":[{"iso_3166_1":"US","rating":"TV-MA"}]}"#);

        assert_eq!(got, pairs(&[("US", "TV-MA")]));
    }

    #[test]
    fn a_country_rated_only_on_a_later_release_still_answers() {
        let got = countries(
            r#"{"results":[{"iso_3166_1":"US","release_dates":[
                {"certification":""},{"certification":" R "}
            ]}]}"#,
        );

        assert_eq!(got, pairs(&[("US", "R")]));
    }

    #[test]
    fn a_country_that_gave_no_label_is_left_out() {
        let got = countries(
            r#"{"results":[
                {"iso_3166_1":"DE","release_dates":[{"certification":""}]},
                {"iso_3166_1":"JP","release_dates":[{"certification":"G"}]},
                {"rating":"PG"}
            ]}"#,
        );

        assert_eq!(got, pairs(&[("JP", "G")]));
    }

    #[test]
    fn a_title_nobody_rated_carries_nothing() {
        assert!(countries(r#"{"results":[{"iso_3166_1":"US","release_dates":[]}]}"#).is_empty());
        assert!(countries(r#"{}"#).is_empty());
    }

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
