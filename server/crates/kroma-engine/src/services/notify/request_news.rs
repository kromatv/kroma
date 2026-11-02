use crate::db;
use crate::model::{MediaRequest, RequestKind, RequestStatus};
use crate::state::SharedState;
use kroma_requests::testing::notify_requester;

fn delivering_state() -> (SharedState, String) {
    let state = crate::test_support::test_state();
    let user = kroma_db::create_user(&state.db, "ana@test.dev", "Ana", "h", &[])
        .unwrap()
        .id;
    (state, user)
}

fn told(state: &SharedState, user: &str) -> Vec<kroma_db::notifications::StoredNotification> {
    let conn = state.db.get().unwrap();
    db::notifications::list_notifications(&conn, user, 50, false).unwrap()
}

fn request(id: &str, kind: RequestKind, status: RequestStatus, requester: &str) -> MediaRequest {
    MediaRequest {
        id: id.into(),
        kind,
        tmdb_id: 42,
        title: "Title".into(),
        year: Some(2020),
        poster_url: None,
        seasons: None,
        episodes: None,
        status,
        requested_by: Some(requester.into()),
        requested_by_name: None,
        reviewed_by: None,
        note: None,
        created_at: 0,
        updated_at: 0,
        progress: None,
        air_status: None,
        next_air_date: None,
        last_refresh_at: None,
    }
}

#[test]
fn a_request_flapping_between_partial_and_available_is_told_once_per_status() {
    let (state, user) = delivering_state();
    let req = request(
        "req-flap",
        RequestKind::Show,
        RequestStatus::PartiallyAvailable,
        &user,
    );

    for status in [
        RequestStatus::PartiallyAvailable,
        RequestStatus::Available,
        RequestStatus::PartiallyAvailable,
        RequestStatus::Available,
    ] {
        notify_requester(&state, &req, status, "/requests");
    }

    let inbox = told(&state, &user);
    assert_eq!(inbox.len(), 2);
    assert!(inbox.iter().all(|row| row.count == 1));
}

#[test]
fn two_requests_reaching_the_same_status_are_two_pieces_of_news() {
    let (state, user) = delivering_state();
    let dune = request(
        "req-dune",
        RequestKind::Movie,
        RequestStatus::Available,
        &user,
    );
    let arrival = request(
        "req-arrival",
        RequestKind::Movie,
        RequestStatus::Available,
        &user,
    );

    notify_requester(&state, &dune, RequestStatus::Available, "/requests");
    notify_requester(&state, &arrival, RequestStatus::Available, "/requests");

    assert_eq!(told(&state, &user).len(), 2);
}
