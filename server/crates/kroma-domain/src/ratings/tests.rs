use super::*;

const REFERENCE: &str = include_str!("../../../../../docs/reference/content-ratings.md");

fn ratings(pairs: &[(&str, &str)]) -> CountryRatings {
    pairs
        .iter()
        .map(|(c, l)| (c.to_string(), l.to_string()))
        .collect()
}

fn shown(label: &str, country: &str, borrowed: bool) -> Option<AgeRating> {
    Some(AgeRating {
        label: label.into(),
        country: country.into(),
        borrowed,
    })
}

fn reference_rows() -> Vec<(String, String, Option<u8>)> {
    REFERENCE
        .lines()
        .filter_map(|line| {
            let cells: Vec<&str> = line.split('|').map(str::trim).collect();
            let label = cells.get(2)?.strip_prefix('`')?.strip_suffix('`')?;
            let age = cells.get(4)?.trim_end_matches(" *");
            Some((cells[1].to_string(), label.to_string(), age.parse().ok()))
        })
        .collect()
}

#[test]
fn a_reader_is_shown_their_own_countrys_label() {
    let r = ratings(&[("FR", "12"), ("US", "PG-13")]);

    assert_eq!(reader_rating(&r, "FR", "US"), shown("12", "FR", false));
}

#[test]
fn a_title_the_readers_country_never_rated_borrows_the_servers_country_first() {
    let r = ratings(&[("DE", "16"), ("US", "R"), ("GB", "15")]);

    assert_eq!(reader_rating(&r, "FR", "GB"), shown("15", "GB", true));
}

#[test]
fn after_the_servers_country_a_title_borrows_from_the_united_states() {
    let r = ratings(&[("DE", "16"), ("US", "R")]);

    assert_eq!(reader_rating(&r, "FR", "GB"), shown("R", "US", true));
}

#[test]
fn after_the_united_states_a_title_borrows_from_the_first_country_by_code() {
    let r = ratings(&[("NL", "12"), ("DE", "16")]);

    assert_eq!(reader_rating(&r, "FR", "GB"), shown("16", "DE", true));
}

#[test]
fn a_label_that_is_not_a_rating_is_passed_over() {
    let r = ratings(&[("FR", "NR"), ("DE", "12")]);

    assert_eq!(reader_rating(&r, "FR", "FR"), shown("12", "DE", true));
}

#[test]
fn a_label_the_table_does_not_know_is_still_shown() {
    let r = ratings(&[("FR", "TP+"), ("DE", "12")]);

    assert_eq!(reader_rating(&r, "FR", "FR"), shown("TP+", "FR", false));
}

#[test]
fn a_title_nobody_rated_is_shown_no_rating() {
    assert_eq!(reader_rating(&CountryRatings::new(), "FR", "FR"), None);
    assert_eq!(reader_rating(&ratings(&[("US", "NR")]), "US", "US"), None);
}

#[test]
fn a_label_carries_the_age_its_own_system_gives_it() {
    assert_eq!(minimum_age("US", "PG-13"), Some(13));
    assert_eq!(minimum_age("US", "R"), Some(17));
    assert_eq!(minimum_age("GB", "PG"), Some(8));
    assert_eq!(minimum_age("DE", "0"), Some(0));
    assert_eq!(minimum_age("TH", "ฉ 20-"), Some(20));
}

#[test]
fn a_label_that_is_not_a_rating_or_is_unknown_has_no_age() {
    assert_eq!(minimum_age("FR", "NR"), None);
    assert_eq!(minimum_age("FR", "TP+"), None);
    assert_eq!(minimum_age("XX", "12"), None);
}

#[test]
fn the_same_label_means_the_age_its_own_country_gives_it() {
    assert_eq!(minimum_age("CA", "A"), Some(18));
    assert_eq!(minimum_age("ES", "A"), Some(0));
}

#[test]
fn the_table_is_sorted_so_every_label_can_be_found() {
    assert!(table()
        .windows(2)
        .all(|w| (w[0].0, w[0].1) < (w[1].0, w[1].1)));
}

#[test]
fn every_line_of_the_table_is_a_row() {
    assert_eq!(table().len(), AGES.lines().count());
}

#[test]
fn every_row_of_the_reference_table_has_the_same_age_here() {
    let rows = reference_rows();

    assert_eq!(rows.len(), table().len());
    for (country, label, age) in rows {
        assert_eq!(minimum_age(&country, &label), age, "{country} {label}");
        assert!(lookup(&country, &label).is_some(), "{country} {label}");
    }
}

#[test]
fn every_country_with_a_rating_system_is_offered_once_in_code_order() {
    let offered = countries();

    assert!(offered.contains(&"FR") && offered.contains(&"US"));
    assert!(offered.windows(2).all(|pair| pair[0] < pair[1]));
}

#[test]
fn a_label_written_with_its_country_is_that_country_s_alone() {
    let dashed = written_ratings("FR-12");
    let slashed = written_ratings(" fr/12 ");
    let coloned = written_ratings("de:16");
    let quebec = written_ratings("CA-QC-13+");

    assert_eq!(dashed, ratings(&[("FR", "12")]));
    assert_eq!(slashed, dashed);
    assert_eq!(coloned, ratings(&[("DE", "16")]));
    assert_eq!(quebec, ratings(&[("CA-QC", "13+")]));
}

#[test]
fn a_label_written_alone_stands_in_every_country_whose_system_has_it() {
    let twelve = written_ratings("12");
    let rated = written_ratings("Rated pg-13");

    assert_eq!(twelve.get("FR").map(String::as_str), Some("12"));
    assert_eq!(twelve.get("DE").map(String::as_str), Some("12"));
    assert!(!twelve.contains_key("US"));
    assert_eq!(rated.get("US").map(String::as_str), Some("PG-13"));
    assert_eq!(
        reader_rating(&twelve, "FR", "US"),
        shown("12", "FR", false)
    );
}

#[test]
fn a_label_no_system_has_or_one_that_only_says_not_rated_stands_for_nothing() {
    assert!(written_ratings("FSK 16").is_empty());
    assert!(written_ratings("NR").is_empty());
    assert!(written_ratings("").is_empty());
    assert!(written_ratings("XX-12").is_empty());
    assert!(written_ratings("FR-NR").is_empty());
}
