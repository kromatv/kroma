//! The age-rating block TMDB appends to a detail request, `release_dates` on a
//! film and `content_ratings` on a show, and every country's label in it.

use serde::Deserialize;

use crate::model::CountryRatings;

/// One appended `release_dates` or `content_ratings` block.
#[derive(Debug, Default, Deserialize)]
pub struct Certifications {
    #[serde(default)]
    pub results: Vec<CountryEntry>,
}

/// One country of a [`Certifications`] block.
#[derive(Debug, Deserialize)]
pub struct CountryEntry {
    /// ISO 3166-1, empty when TMDB left it out.
    #[serde(default, rename = "iso_3166_1")]
    pub country: String,
    #[serde(default)]
    rating: Option<String>,
    #[serde(default)]
    pub release_dates: Vec<ReleaseDate>,
}

/// One release of a film in one country.
#[derive(Debug, Deserialize)]
pub struct ReleaseDate {
    #[serde(default)]
    certification: Option<String>,
    /// TMDB's release type: 3 theatrical, 4 digital, 5 physical, among others.
    #[serde(rename = "type", default)]
    pub kind: u32,
    #[serde(default)]
    pub release_date: Option<String>,
}

impl Certifications {
    /// Every country that gave the title a label, with that label.
    pub fn every_country(&self) -> CountryRatings {
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
}
