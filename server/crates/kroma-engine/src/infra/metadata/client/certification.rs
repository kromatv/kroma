//! The age-rating block TMDB appends to a detail request, and the pick over it.

use serde::Deserialize;

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
    pub(super) fn preferring(&self, country: &str) -> Option<String> {
        self.results
            .iter()
            .find(|entry| entry.country == country)
            .and_then(CountryEntry::rating)
            .or_else(|| self.results.iter().find_map(CountryEntry::rating))
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

pub(super) fn country_of(language: &str) -> String {
    let mut parts = language.split(['-', '_']);
    let base = parts.next().unwrap_or_default();
    parts
        .next()
        .filter(|region| !region.is_empty())
        .or_else(|| tmdb_region_of(base).split('-').nth(1))
        .unwrap_or(FALLBACK_REGION)
        .to_ascii_uppercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> Certifications {
        serde_json::from_str(raw).unwrap()
    }

    #[test]
    fn a_movie_carries_the_rating_the_asked_country_gave_it() {
        let c = parse(
            r#"{"results":[
                {"iso_3166_1":"FR","release_dates":[{"certification":"12"}]},
                {"iso_3166_1":"US","release_dates":[{"certification":"PG-13"}]}
            ]}"#,
        );

        assert_eq!(c.preferring("US").as_deref(), Some("PG-13"));
        assert_eq!(c.preferring("FR").as_deref(), Some("12"));
    }

    #[test]
    fn a_show_carries_its_rating_on_the_country_itself() {
        let c = parse(r#"{"results":[{"iso_3166_1":"US","rating":"TV-MA"}]}"#);

        assert_eq!(c.preferring("US").as_deref(), Some("TV-MA"));
    }

    #[test]
    fn a_country_rated_only_on_a_later_release_still_answers() {
        let c = parse(
            r#"{"results":[{"iso_3166_1":"US","release_dates":[
                {"certification":""},{"certification":"R"}
            ]}]}"#,
        );

        assert_eq!(c.preferring("US").as_deref(), Some("R"));
    }

    #[test]
    fn a_title_the_asked_country_never_rated_falls_back_to_one_that_did() {
        let c = parse(
            r#"{"results":[
                {"iso_3166_1":"DE","release_dates":[{"certification":""}]},
                {"iso_3166_1":"JP","release_dates":[{"certification":"G"}]}
            ]}"#,
        );

        assert_eq!(c.preferring("US").as_deref(), Some("G"));
    }

    #[test]
    fn a_title_nobody_rated_carries_nothing() {
        let c = parse(r#"{"results":[{"iso_3166_1":"US","release_dates":[]}]}"#);

        assert!(c.preferring("US").is_none());
        assert!(parse(r#"{}"#).preferring("US").is_none());
    }

    #[test]
    fn the_country_comes_from_the_language_tags_own_region() {
        assert_eq!(country_of("pt-PT"), "PT");
        assert_eq!(country_of("en-US"), "US");
    }

    #[test]
    fn a_bare_language_takes_the_country_tmdb_pairs_it_with() {
        assert_eq!(country_of("fr"), "FR");
        assert_eq!(country_of("ja"), "JP");
    }

    #[test]
    fn a_language_tmdb_knows_no_region_for_falls_back_to_the_united_states() {
        assert_eq!(country_of("sv"), "US");
        assert_eq!(country_of(""), "US");
    }
}
