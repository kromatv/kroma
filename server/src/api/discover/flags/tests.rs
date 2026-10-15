use super::*;

use crate::api::test_support::{demo_item_id, demo_library_ids, grant_libraries, seed_session, test_app, TestApp};
use crate::db::metadata_core::{self, MetaCore};

const SINTEL: u64 = 45745;
const MATRIX: u64 = 603;

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
fn a_viewer_who_may_not_request_sees_no_one_s_request() {
    let t = test_app();
    requested_by_someone_else(&t);
    let member = viewer(&t, "ana", &[]);

    let entry = flagged(&t, &member, SINTEL);

    assert_eq!(entry.request_id, None);
    assert_eq!(entry.request_status, None);
    assert_eq!(entry.request_progress, None);
}

#[test]
fn the_overlay_follows_the_permission_to_request() {
    let t = test_app();
    let users = [
        viewer(&t, "ana", &[]),
        viewer(&t, "bo", &[Permission::RequestsCreate]),
    ];

    let overlays = users.each_ref().map(Overlay::for_viewer);

    assert_eq!(overlays, [Overlay::Catalogue, Overlay::Requests]);
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
