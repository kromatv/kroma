use super::*;
use crate::db::metadata_core::ITEM;
use crate::services::{enrich, scan};
use crate::test_support::FakeTmdb;

const HEAT: u64 = 949;
const RONIN: u64 = 8195;
const THIEF: u64 = 11524;
const THE_WIRE: u64 = 1438;
const THE_SHIELD: u64 = 1414;
const KNOWN_TO_NO_CATALOGUE: &str = "tt0000001";

fn film(id: u64, name: &str) -> Value {
    json!({ "id": id, "title": name })
}

fn show(id: u64, name: &str) -> Value {
    json!({ "id": id, "name": name })
}

fn catalogue(path: &str) -> (u16, Value) {
    match path {
        "/search/movie" => (200, json!({ "results": [film(RONIN, "Ronin")] })),
        "/search/tv" => (200, json!({ "results": [show(THE_SHIELD, "The Shield")] })),
        "/movie/949" => (200, film(HEAT, "Heat")),
        "/movie/8195" => (200, film(RONIN, "Ronin")),
        "/movie/11524" => (200, film(THIEF, "Thief")),
        "/tv/1438" => (200, show(THE_WIRE, "The Wire")),
        "/tv/1414" => (200, show(THE_SHIELD, "The Shield")),
        "/tv/1438/season/1" | "/tv/1414/season/1" => (200, json!({ "episodes": [] })),
        "/find/tt0113277" => (200, json!({ "movie_results": [{ "id": HEAT }] })),
        "/find/79126" => (200, json!({ "tv_results": [{ "id": THE_WIRE }] })),
        "/find/tt0000001" => (200, json!({ "movie_results": [], "tv_results": [] })),
        _ => (404, json!({})),
    }
}

fn tmdb() -> FakeTmdb {
    FakeTmdb::start_shared(catalogue)
}

fn asked_to_find(tmdb: &FakeTmdb) -> Vec<String> {
    tmdb.requests()
        .iter()
        .filter(|request| request.starts_with("/find/"))
        .map(|request| {
            let (path, query) = request.split_once('?').unwrap_or((request, ""));
            let by = query
                .split('&')
                .find(|param| param.starts_with("external_source="))
                .unwrap_or_default();
            format!("{path}?{by}")
        })
        .collect()
}

impl Household {
    fn holds(&self, file: &str) {
        let path = self.disk.path().join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"x").unwrap();
    }

    fn with_a_film_filed_as_ronin() -> Self {
        let household = household();
        household.holds(&format!("movies/{FILED_AS_RONIN}"));
        household
    }

    fn scan_and_match(&self) {
        scan::rescan_sync(&scan::WalkTurn::wait(), &self.state, &mut scan::uninterrupted).unwrap();
        let items = db::list_items(&self.state.db, None).unwrap();
        let shows = db::list_shows(&self.state.db, None).unwrap();
        enrich::run_tracked(&self.state, &items, &shows, |_, _| (), || false);
    }

    fn match_by_hand(&self, tmdb: u64) {
        let items = db::list_items(&self.state.db, None).unwrap();
        db::tmdb_pin::set(&self.state.db, ITEM, &items[0].id, tmdb).unwrap();
    }

    fn films(&self) -> Vec<u64> {
        db::list_items(&self.state.db, None)
            .unwrap()
            .into_iter()
            .filter_map(|item| item.metadata)
            .map(|metadata| metadata.tmdb_id)
            .collect()
    }

    fn shows(&self) -> Vec<u64> {
        db::list_shows(&self.state.db, None)
            .unwrap()
            .into_iter()
            .filter_map(|show| show.metadata)
            .map(|metadata| metadata.tmdb_id)
            .collect()
    }
}

#[test]
fn a_file_with_an_imported_identity_matches_that_title_on_its_first_scan() {
    let _tmdb = tmdb();
    let household = Household::with_a_film_filed_as_ronin();
    household.offer(&[heat_filed_as_ronin(json!({ "tmdb": "949" }))]);

    household.scan_and_match();

    assert_eq!(household.films(), vec![HEAT]);
}

#[test]
fn a_file_with_no_imported_identity_matches_by_its_name() {
    let _tmdb = tmdb();
    let household = Household::with_a_film_filed_as_ronin();

    household.scan_and_match();

    assert_eq!(household.films(), vec![RONIN]);
}

#[test]
fn a_match_made_by_hand_in_kroma_wins_over_an_imported_identity() {
    let _tmdb = tmdb();
    let household = Household::with_a_film_filed_as_ronin();
    household.scan_and_match();
    household.match_by_hand(THIEF);
    household.offer(&[heat_filed_as_ronin(json!({ "tmdb": "949" }))]);

    household.scan_and_match();

    assert_eq!(household.films(), vec![THIEF]);
}

#[test]
fn a_film_the_other_server_holds_only_by_its_imdb_id_matches_that_film() {
    let tmdb = tmdb();
    let household = Household::with_a_film_filed_as_ronin();
    household.offer(&[heat_filed_as_ronin(json!({ "imdb": "tt0113277" }))]);

    household.scan_and_match();

    assert_eq!(household.films(), vec![HEAT]);
    assert_eq!(
        asked_to_find(&tmdb),
        vec!["/find/tt0113277?external_source=imdb_id"]
    );
}

#[test]
fn a_show_the_other_server_holds_only_by_its_tvdb_id_matches_that_show() {
    let tmdb = tmdb();
    let household = household();
    household.holds(&format!("shows/{FILED_AS_THE_SHIELD}"));
    household.offer(&[the_wire_filed_as_the_shield(json!({ "tvdb": "79126" }))]);

    household.scan_and_match();

    assert_eq!(household.shows(), vec![THE_WIRE]);
    assert_eq!(
        asked_to_find(&tmdb),
        vec!["/find/79126?external_source=tvdb_id"]
    );
}

#[test]
fn an_identity_kept_after_its_file_matched_by_name_matches_the_file_again() {
    let _tmdb = tmdb();
    let household = Household::with_a_film_filed_as_ronin();
    household.scan_and_match();
    household.offer(&[heat_filed_as_ronin(json!({ "imdb": "tt0113277" }))]);

    household.scan_and_match();

    assert_eq!(household.films(), vec![HEAT]);
}

#[test]
fn tmdb_is_asked_once_about_an_identity_whatever_it_answers() {
    let tmdb = tmdb();
    let household = household();
    household.holds(&format!("movies/{FILED_AS_RONIN}"));
    household.holds(&format!("shows/{FILED_AS_THE_SHIELD}"));
    household.offer(&[
        heat_filed_as_ronin(json!({ "imdb": KNOWN_TO_NO_CATALOGUE })),
        the_wire_filed_as_the_shield(json!({ "tvdb": "79126" })),
    ]);
    household.scan_and_match();
    let first = asked_to_find(&tmdb).len();

    household.scan_and_match();

    assert_eq!(first, 2);
    assert_eq!(asked_to_find(&tmdb).len(), first);
    assert_eq!(household.films(), vec![RONIN]);
    assert_eq!(household.shows(), vec![THE_WIRE]);
}
