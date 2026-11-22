//! Age ratings: the label each country's system gave a title, the minimum age
//! behind it, and the one a reader is shown.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

#[cfg(test)]
mod tests;

/// Every country's label for one title, keyed by the provider's country code.
pub type CountryRatings = BTreeMap<String, String>;

/// The rating a reader is shown: their country's label, or another country's
/// when theirs never rated the title.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgeRating {
    pub label: String,
    pub country: String,
    pub borrowed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LabelAge {
    Age(u8),
    NotARating,
}

type AgeRow = (&'static str, &'static str, LabelAge);

const AGES: &str = include_str!("ages.tsv");
const BORROWED_FIRST: &str = "US";

/// The youngest viewer `label` is rated for in `country`'s system. `None` for a
/// label that is not a rating, and for one the table does not know.
pub fn minimum_age(country: &str, label: &str) -> Option<u8> {
    match lookup(country, label) {
        Some(LabelAge::Age(age)) => Some(age),
        _ => None,
    }
}

/// The rating shown to a reader whose ratings country is `reader`, on a server
/// whose metadata country is `server`. A title the reader's country never
/// rated borrows from `server`, then the United States, then the first other
/// country by code.
pub fn reader_rating(ratings: &CountryRatings, reader: &str, server: &str) -> Option<AgeRating> {
    let country = [reader, server, BORROWED_FIRST]
        .into_iter()
        .chain(ratings.keys().map(String::as_str))
        .find(|country| rated(ratings, country).is_some())?;
    Some(AgeRating {
        label: rated(ratings, country)?.to_string(),
        country: country.to_string(),
        borrowed: country != reader,
    })
}

fn rated<'a>(ratings: &'a CountryRatings, country: &str) -> Option<&'a str> {
    ratings
        .get(country)
        .map(String::as_str)
        .filter(|label| lookup(country, label) != Some(LabelAge::NotARating))
}

fn lookup(country: &str, label: &str) -> Option<LabelAge> {
    let rows = table();
    rows.binary_search_by(|(c, l, _)| (*c, *l).cmp(&(country, label)))
        .ok()
        .map(|i| rows[i].2)
}

fn table() -> &'static [AgeRow] {
    static ROWS: OnceLock<Vec<AgeRow>> = OnceLock::new();
    ROWS.get_or_init(|| AGES.lines().filter_map(age_row).collect())
}

fn age_row(line: &'static str) -> Option<AgeRow> {
    let mut cells = line.split('\t');
    let (country, label) = (cells.next()?, cells.next()?);
    let age = match cells.next()? {
        "" => LabelAge::NotARating,
        years => LabelAge::Age(years.parse().ok()?),
    };
    Some((country, label, age))
}
