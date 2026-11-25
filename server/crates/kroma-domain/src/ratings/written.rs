use super::{AgeRow, CountryRatings, LabelAge, table};

const RATED: &str = "rated ";
const SEPARATORS: [char; 4] = ['-', ':', '/', ' '];

/// The ratings a label written by hand or in a `.nfo` file stands for, read
/// the ways Plex, Jellyfin and Kodi write one. With its country ("FR-12",
/// "fr/12", "DE:16") it is that country's label alone; without ("12", "Rated
/// PG-13") it is the label of every country whose system has it, so each
/// reader finds it in their own country's first. Empty for a label no system
/// has, and for one that some system reads as "not rated".
pub fn written_ratings(text: &str) -> CountryRatings {
    let bare = without_rated(text.trim());
    let named: Vec<&AgeRow> = match table().iter().find(|row| in_country(row, bare)) {
        Some(row) => vec![row],
        None => table()
            .iter()
            .filter(|(_, label, _)| label.eq_ignore_ascii_case(bare))
            .collect(),
    };
    if !named.iter().all(|row| matches!(row.2, LabelAge::Age(_))) {
        return CountryRatings::new();
    }
    named
        .into_iter()
        .map(|(country, label, _)| (country.to_string(), label.to_string()))
        .collect()
}

fn without_rated(text: &str) -> &str {
    match text.get(..RATED.len()) {
        Some(head) if head.eq_ignore_ascii_case(RATED) => text[RATED.len()..].trim_start(),
        _ => text,
    }
}

fn in_country((country, label, _): &AgeRow, text: &str) -> bool {
    let named = text
        .get(..country.len())
        .is_some_and(|head| head.eq_ignore_ascii_case(country));
    named
        && text[country.len()..]
            .strip_prefix(SEPARATORS)
            .is_some_and(|rest| rest.trim().eq_ignore_ascii_case(label))
}
