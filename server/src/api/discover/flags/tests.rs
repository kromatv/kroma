use super::*;

use crate::model::Permission;

use crate::api::test_support::{demo_item_id, demo_library_ids, demo_show_id, grant_libraries, seed_session, test_app, TestApp};
use crate::db::metadata_core::{self, MetaCore};

const SINTEL: u64 = 45745;
const MATRIX: u64 = 603;
const OFFICE: u64 = 2316;

fn hit(tmdb_id: u64) -> discover::DiscoverHit {
    discover::DiscoverHit {
        kind: RequestKind::Movie,
        tmdb_id,
        title: "Sintel".into(),
        original_title: "Sintel".into(),
        year: Some(2010),
        poster_url: None,
        backdrop_url: None,
        overview: None,
        rating: None,
    }
}

fn requested_by_someone_else(t: &TestApp) {
    let request = db::NewRequest {
        id: "r1".into(),
        kind: RequestKind::Movie,
        tmdb_id: SINTEL,
        title: "Sintel".into(),
        year: Some(2010),
        poster_url: None,
        seasons: None,
        episodes: None,
        status: RequestStatus::Pending,
        requested_by: Some(t.user_id.clone()),
    };
    db::insert_request(&t.state.db, &request, 1).unwrap();
}

fn viewer(t: &TestApp, name: &str, perms: &[Permission]) -> User {
    let (id, _) = seed_session(&t.state, &format!("{name}@t.dev"), name, perms);
    db::get_user(&t.state.db, &id).unwrap().unwrap()
}

fn granted(t: &TestApp, name: &str, library: String) -> User {
    let user = viewer(t, name, &[]);
    grant_libraries(&t.state, &user.id, &[library]);
    db::get_user(&t.state.db, &user.id).unwrap().unwrap()
}

fn flagged(t: &TestApp, viewer: &User, tmdb_id: u64) -> DiscoverEntry {
    let conn = t.state.db.get().unwrap();
    flag_hits(&conn, vec![hit(tmdb_id)], viewer)
        .unwrap()
        .remove(0)
}

#[test]
fn a_viewer_who_may_request_sees_the_request_someone_else_made() {
    let t = test_app();
    requested_by_someone_else(&t);
    let asker = viewer(&t, "bo", &[Permission::RequestsCreate]);

    let entry = flagged(&t, &asker, SINTEL);

    assert_eq!(entry.request_id.as_deref(), Some("r1"));
    assert_eq!(entry.request_status, Some(RequestStatus::Pending));
}

#[test]
fn only_a_member_granted_its_library_learns_the_title_is_in_it() {
    let t = test_app();
    let matrix = demo_item_id("The Matrix");
    let core = MetaCore { tmdb_id: Some(MATRIX), ..MetaCore::default() };
    metadata_core::set_core(&t.state.db, metadata_core::ITEM, &matrix, &core).unwrap();
    let (films, shows) = demo_library_ids();
    let users = [granted(&t, "ana", films), granted(&t, "bo", shows)];

    let entries = users.each_ref().map(|user| flagged(&t, user, MATRIX));

    let flags = entries.map(|e| (e.in_library, e.local_id));
    assert_eq!(flags, [(true, Some(matrix)), (false, None)]);
}

fn raw(kind: RequestKind, tmdb_id: u64) -> discover::DiscoverRawDetail {
    discover::DiscoverRawDetail {
        kind,
        tmdb_id,
        title: "The Office".into(),
        year: Some(2005),
        poster_url: None,
        backdrop_url: None,
        overview: None,
        tagline: None,
        genres: Vec::new(),
        tmdb_genre_ids: Vec::new(),
        rating: None,
        runtime_min: None,
        imdb_id: None,
        seasons: Vec::new(),
        cast: Vec::new(),
        crew: Vec::new(),
        similar: Vec::new(),
        status: None,
        next_air: None,
        available_date: None,
        cinema_date: None,
        original_language: None,
        original_title: None,
        origin_country: None,
    }
}

fn season(number: u32, episode_count: u32) -> discover::RawSeason {
    discover::RawSeason {
        season: number,
        name: Some(format!("Saison {number}")),
        episode_count,
        air_date: Some("2005-09-20".into()),
    }
}

fn office_in_the_library(t: &TestApp) -> (String, User) {
    let show = demo_show_id("The Office");
    let core = MetaCore {
        tmdb_id: Some(OFFICE),
        ..MetaCore::default()
    };
    metadata_core::set_core(&t.state.db, metadata_core::SHOW, &show, &core).unwrap();
    let (_, shows) = demo_library_ids();
    (show, granted(t, "ana", shows))
}

fn open_request(t: &TestApp, status: RequestStatus, seasons: Option<Vec<u32>>) {
    let request = db::NewRequest {
        id: "rq-office".into(),
        kind: RequestKind::Show,
        tmdb_id: OFFICE,
        title: "The Office".into(),
        year: Some(2005),
        poster_url: None,
        seasons,
        episodes: None,
        status,
        requested_by: Some(t.user_id.clone()),
    };
    db::insert_request(&t.state.db, &request, 1).unwrap();
}

fn grab(t: &TestApp, status: &str, progress: f64) {
    t.state
        .db
        .get()
        .unwrap()
        .execute_batch(&format!(
            "INSERT INTO downloads \
             (id,client_id,client_ref,request_id,kind,tmdb_id,release_title,magnet_or_url,\
              status,progress,grabbed_at) \
             VALUES ('d1','c1','ref1','rq-office','show',{OFFICE},'The.Office.S02','magnet:?x',\
              '{status}',{progress},1)"
        ))
        .unwrap();
}

fn detail(t: &TestApp, viewer: &User, d: discover::DiscoverRawDetail) -> DiscoverDetail {
    let conn = t.state.db.get().unwrap();
    flag_detail(&conn, d, viewer).unwrap()
}

#[test]
fn a_film_detail_carries_its_home_release_date_and_never_a_season() {
    let t = test_app();
    let asker = viewer(&t, "bo", &[Permission::RequestsCreate]);
    let mut d = raw(RequestKind::Movie, SINTEL);
    d.available_date = Some("2026-01-10".into());
    d.status = Some("Released".into());
    d.similar = vec![hit(MATRIX)];

    let fiche = detail(&t, &asker, d);

    assert_eq!(fiche.next_air_date.as_deref(), Some("2026-01-10"));
    assert_eq!(fiche.air_status.as_deref(), Some("Released"));
    assert!(fiche.seasons.is_empty());
    assert!(!fiche.in_library);
    assert_eq!(fiche.similar.len(), 1);
}

#[test]
fn a_show_detail_dates_itself_from_the_next_episode_to_air() {
    let t = test_app();
    let asker = viewer(&t, "bo", &[Permission::RequestsCreate]);
    let mut d = raw(RequestKind::Show, OFFICE);
    d.next_air = Some(("2026-02-01".into(), 3, 1));

    let fiche = detail(&t, &asker, d);

    assert_eq!(fiche.next_air_date.as_deref(), Some("2026-02-01"));
}

#[test]
fn a_season_is_available_only_once_every_episode_it_lists_is_on_disk() {
    let t = test_app();
    let (show, ana) = office_in_the_library(&t);
    let mut d = raw(RequestKind::Show, OFFICE);
    d.seasons = vec![season(1, 6), season(2, 2)];

    let fiche = detail(&t, &ana, d);

    assert_eq!(fiche.local_id.as_deref(), Some(show.as_str()));
    assert!(fiche.in_library);
    let flags: Vec<(u32, bool, u32)> = fiche
        .seasons
        .iter()
        .map(|s| (s.season, s.available, s.episodes_available))
        .collect();
    assert_eq!(flags, [(1, false, 0), (2, true, 2)]);
}

#[test]
fn a_season_tmdb_lists_no_episodes_for_is_never_called_available() {
    let t = test_app();
    let (_, ana) = office_in_the_library(&t);
    let mut d = raw(RequestKind::Show, OFFICE);
    d.seasons = vec![season(3, 0)];

    let fiche = detail(&t, &ana, d);

    assert!(!fiche.seasons[0].available);
    assert_eq!(fiche.seasons[0].episodes_available, 0);
}

#[test]
fn a_show_nobody_holds_reads_every_season_as_absent() {
    let t = test_app();
    let asker = viewer(&t, "bo", &[Permission::RequestsCreate]);
    let mut d = raw(RequestKind::Show, OFFICE);
    d.seasons = vec![season(1, 6)];

    let fiche = detail(&t, &asker, d);

    assert_eq!(fiche.local_id, None);
    assert_eq!(fiche.seasons[0].episodes_available, 0);
    assert!(!fiche.seasons[0].requested);
}

#[test]
fn an_open_request_marks_the_seasons_it_asked_for_and_no_others() {
    let t = test_app();
    let asker = viewer(&t, "bo", &[Permission::RequestsCreate]);
    open_request(&t, RequestStatus::Pending, Some(vec![2]));
    let mut d = raw(RequestKind::Show, OFFICE);
    d.seasons = vec![season(1, 6), season(2, 2)];

    let fiche = detail(&t, &asker, d);

    assert_eq!(fiche.request_id.as_deref(), Some("rq-office"));
    let asked: Vec<bool> = fiche.seasons.iter().map(|s| s.requested).collect();
    assert_eq!(asked, [false, true]);
}

#[test]
fn a_request_for_the_whole_show_marks_every_season_tmdb_lists() {
    let t = test_app();
    let asker = viewer(&t, "bo", &[Permission::RequestsCreate]);
    open_request(&t, RequestStatus::Pending, None);
    let mut d = raw(RequestKind::Show, OFFICE);
    d.seasons = vec![season(1, 6), season(2, 2)];

    let fiche = detail(&t, &asker, d);

    let asked: Vec<bool> = fiche.seasons.iter().map(|s| s.requested).collect();
    assert_eq!(asked, [true, true]);
}

#[test]
fn a_live_grab_reads_as_downloading_over_the_request_that_approved_it() {
    let t = test_app();
    let asker = viewer(&t, "bo", &[Permission::RequestsCreate]);
    open_request(&t, RequestStatus::Approved, None);
    grab(&t, "downloading", 0.42);

    let fiche = detail(&t, &asker, raw(RequestKind::Show, OFFICE));

    assert_eq!(fiche.request_status, Some(RequestStatus::Downloading));
    assert_eq!(fiche.request_progress, Some(0.42));
}

#[test]
fn a_finished_grab_reads_as_importing_until_the_files_land() {
    let t = test_app();
    let asker = viewer(&t, "bo", &[Permission::RequestsCreate]);
    open_request(&t, RequestStatus::Approved, None);
    grab(&t, "completed", 1.0);

    let fiche = detail(&t, &asker, raw(RequestKind::Show, OFFICE));

    assert_eq!(fiche.request_status, Some(RequestStatus::Importing));
    assert_eq!(fiche.request_progress, Some(1.0));
}

#[test]
fn a_request_nobody_approved_keeps_its_own_status_whatever_the_grab_says() {
    let t = test_app();
    let asker = viewer(&t, "bo", &[Permission::RequestsCreate]);
    open_request(&t, RequestStatus::Pending, None);
    grab(&t, "downloading", 0.42);

    let fiche = detail(&t, &asker, raw(RequestKind::Show, OFFICE));

    assert_eq!(fiche.request_status, Some(RequestStatus::Pending));
    assert_eq!(fiche.request_progress, None);
}
