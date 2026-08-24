use super::*;
use crate::model::RequestKind;
use crate::services::requests::test_fixtures::{wanted, wr};
use crate::services::requests::test_support::{
    insert_req, seed_movie_item, seed_show, status_of_req, test_host,
};

#[test]
fn tally_wanted_counts_aired_present_and_newly_available() {
    use std::collections::HashSet;
    let today = "2026-07-18";
    let wanted = vec![
        wr(1, 1, None, "wanted"), // aired (null date), present -> newly available
        wr(1, 2, Some("2030-01-01"), "wanted"), // future -> not aired, ignored
        wr(1, 3, Some("2020-01-01"), "available"), // aired + present, already available
        wr(1, 4, None, "wanted"), // aired but not present
    ];
    let present: HashSet<(u32, u32)> = [(1, 1), (1, 3)].into_iter().collect();
    let (aired, have, newly) = tally_wanted(&wanted, &present, today);
    assert_eq!(aired, 3);
    assert_eq!(have, 2);
    assert_eq!(newly, vec!["s1e1".to_string()]);
}

#[test]
fn tally_wanted_skips_rows_without_season_or_episode() {
    use std::collections::HashSet;
    let mut movie_row = wr(1, 1, None, "wanted");
    movie_row.season = None;
    movie_row.episode = None;
    let present: HashSet<(u32, u32)> = HashSet::new();
    let (aired, have, newly) = tally_wanted(&[movie_row], &present, "2026-07-18");
    assert_eq!((aired, have, newly.len()), (0, 0, 0));
}

#[test]
fn match_one_movie_flips_wanted_and_request_to_available() {
    let host = test_host();
    seed_movie_item(&host, "m1", 603);
    insert_req(
        &host,
        "r1",
        RequestKind::Movie,
        603,
        RequestStatus::Approved,
    );
    db::replace_wanted(
        host.db(),
        "r1",
        &[wanted("w1", "r1", None, None, None, "wanted")],
        now_ms(),
    )
    .unwrap();

    let status = match_one(&host, "r1").unwrap();
    assert_eq!(status, Some(RequestStatus::Available));
    assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
    let conn = host.db().get().unwrap();
    assert_eq!(
        db::wanted_for_request(&conn, "r1").unwrap()[0].status,
        "available"
    );
}

#[test]
fn match_one_movie_absent_from_catalog_is_no_judgement() {
    let host = test_host();
    insert_req(
        &host,
        "r1",
        RequestKind::Movie,
        999,
        RequestStatus::Approved,
    );
    assert_eq!(match_one(&host, "r1").unwrap(), None);
    assert_eq!(status_of_req(&host, "r1"), RequestStatus::Approved);
}

#[test]
fn match_one_show_available_when_all_aired_episodes_present() {
    let host = test_host();
    seed_show(&host, "s1", 1396, &[(1, 1), (1, 2)]);
    insert_req(
        &host,
        "r1",
        RequestKind::Show,
        1396,
        RequestStatus::Approved,
    );
    db::replace_wanted(
        host.db(),
        "r1",
        &[
            wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "wanted"),
            wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "wanted"),
        ],
        now_ms(),
    )
    .unwrap();

    assert_eq!(
        match_one(&host, "r1").unwrap(),
        Some(RequestStatus::Available)
    );
    assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
}

#[test]
fn match_one_show_partial_when_some_episodes_missing() {
    let host = test_host();
    seed_show(&host, "s1", 1396, &[(1, 1)]);
    insert_req(
        &host,
        "r1",
        RequestKind::Show,
        1396,
        RequestStatus::Approved,
    );
    db::replace_wanted(
        host.db(),
        "r1",
        &[
            wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "wanted"),
            wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "wanted"),
        ],
        now_ms(),
    )
    .unwrap();

    assert_eq!(
        match_one(&host, "r1").unwrap(),
        Some(RequestStatus::PartiallyAvailable)
    );
    assert_eq!(
        status_of_req(&host, "r1"),
        RequestStatus::PartiallyAvailable
    );
}

#[test]
fn match_one_show_pending_without_ledger_is_no_judgement() {
    let host = test_host();
    seed_show(&host, "s1", 1396, &[(1, 1)]);
    insert_req(&host, "r1", RequestKind::Show, 1396, RequestStatus::Pending);
    assert_eq!(match_one(&host, "r1").unwrap(), None);
}

#[test]
fn availability_pass_checks_nonterminal_and_counts_changes() {
    let host = test_host();
    seed_movie_item(&host, "m1", 603);
    insert_req(
        &host,
        "r1",
        RequestKind::Movie,
        603,
        RequestStatus::Approved,
    );
    db::replace_wanted(
        host.db(),
        "r1",
        &[wanted("w1", "r1", None, None, None, "wanted")],
        now_ms(),
    )
    .unwrap();
    insert_req(
        &host,
        "r2",
        RequestKind::Show,
        1396,
        RequestStatus::Approved,
    );
    insert_req(&host, "r3", RequestKind::Movie, 700, RequestStatus::Denied);

    let summary = availability_pass(&host).unwrap();
    assert_eq!(summary.checked, 2, "denied request excluded from the pass");
    assert_eq!(summary.changed, 1, "only the movie flipped");
    assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
}

#[test]
fn match_one_unknown_request_is_none() {
    let host = test_host();
    assert_eq!(match_one(&host, "ghost").unwrap(), None);
}

#[test]
fn match_show_never_regresses_a_fully_available_request() {
    let host = test_host();
    seed_show(&host, "s1", 1396, &[(1, 1)]);
    insert_req(
        &host,
        "r1",
        RequestKind::Show,
        1396,
        RequestStatus::Available,
    );
    db::replace_wanted(
        host.db(),
        "r1",
        &[
            wanted(
                "w1",
                "r1",
                Some(1),
                Some(1),
                Some("2020-01-01"),
                "available",
            ),
            wanted(
                "w2",
                "r1",
                Some(1),
                Some(2),
                Some("2020-01-02"),
                "available",
            ),
        ],
        now_ms(),
    )
    .unwrap();
    assert_eq!(
        match_one(&host, "r1").unwrap(),
        Some(RequestStatus::Available)
    );
    assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
}

#[test]
fn match_show_no_verdict_when_aired_but_none_present() {
    let host = test_host();
    seed_show(&host, "s1", 1396, &[]);
    insert_req(
        &host,
        "r1",
        RequestKind::Show,
        1396,
        RequestStatus::Approved,
    );
    db::replace_wanted(
        host.db(),
        "r1",
        &[
            wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "wanted"),
            wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "wanted"),
        ],
        now_ms(),
    )
    .unwrap();
    assert_eq!(match_one(&host, "r1").unwrap(), None);
    assert_eq!(status_of_req(&host, "r1"), RequestStatus::Approved);
}

#[test]
fn a_film_already_marked_available_is_matched_again_without_a_second_announcement() {
    let host = test_host();
    seed_movie_item(&host, "m1", 603);
    insert_req(
        &host,
        "r1",
        RequestKind::Movie,
        603,
        RequestStatus::Available,
    );
    db::replace_wanted(
        host.db(),
        "r1",
        &[wanted("w1", "r1", None, None, None, "wanted")],
        now_ms(),
    )
    .unwrap();

    assert_eq!(
        match_one(&host, "r1").unwrap(),
        Some(RequestStatus::Available)
    );
    assert!(host.notifications().is_empty());
    let conn = host.db().get().unwrap();
    assert_eq!(
        db::wanted_for_request(&conn, "r1").unwrap()[0].status,
        "available"
    );
}

#[test]
fn a_show_that_is_still_exactly_as_partial_as_before_announces_nothing_new() {
    let host = test_host();
    seed_show(&host, "s1", 1396, &[(1, 1)]);
    insert_req(
        &host,
        "r1",
        RequestKind::Show,
        1396,
        RequestStatus::PartiallyAvailable,
    );
    db::replace_wanted(
        host.db(),
        "r1",
        &[
            wanted(
                "w1",
                "r1",
                Some(1),
                Some(1),
                Some("2020-01-01"),
                "available",
            ),
            wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "wanted"),
        ],
        now_ms(),
    )
    .unwrap();

    assert_eq!(
        match_one(&host, "r1").unwrap(),
        Some(RequestStatus::PartiallyAvailable)
    );
    assert!(host.notifications().is_empty());
}
