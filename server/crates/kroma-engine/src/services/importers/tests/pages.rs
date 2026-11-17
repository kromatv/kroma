use super::*;

#[test]
fn titles_asks_for_one_library_from_a_cursor_and_says_how_many_rows_it_takes() {
    let (importers, sent) = answering(json!({ "Ok": { "titles": rows(2), "next": "c-2" } }));
    let ask = TitlesAsk {
        cursor: Some("c-1".into()),
        ..first_page()
    };

    let page = importers.titles(IMPORTER, &ask).unwrap();

    assert_eq!(
        sent_once(&sent),
        (
            "titles".to_string(),
            json!({
                "signIn": "s-1",
                "server": "srv",
                "library": "1",
                "cursor": "c-1",
                "limit": MAX_PAGE_ROWS,
            })
        )
    );
    assert_eq!(page.titles.len(), 2);
    assert_eq!(page.next.as_deref(), Some("c-2"));
}

#[test]
fn states_asks_for_one_user_in_one_library_changed_since_a_time() {
    let (importers, sent) = answering(json!({ "Ok": {
        "states": [{ "title": "t1", "watched": true, "positionMs": 90_000 }],
    }}));
    let ask = StatesAsk {
        sign_in: "s-1".into(),
        server: "srv".into(),
        user: "42".into(),
        library: "1".into(),
        cursor: None,
        changed_since: Some(1_700_000_000),
    };

    let page = importers.states(IMPORTER, &ask).unwrap();

    assert_eq!(
        sent_once(&sent),
        (
            "states".to_string(),
            json!({
                "signIn": "s-1",
                "server": "srv",
                "user": "42",
                "library": "1",
                "changedSince": 1_700_000_000,
                "limit": MAX_PAGE_ROWS,
            })
        )
    );
    assert_eq!(page.states[0].position_ms, Some(90_000));
    assert_eq!(page.next, None);
}

#[test]
fn plays_asks_for_a_server_s_plays_from_a_cursor() {
    let (importers, sent) = answering(json!({ "Ok": {
        "plays": [{ "id": "p1", "user": "42", "title": "t1", "playedAt": 1_700_000_000 }],
    }}));
    let ask = PlaysAsk {
        sign_in: "s-1".into(),
        server: "srv".into(),
        cursor: Some("c-9".into()),
        changed_since: None,
    };

    let page = importers.plays(IMPORTER, &ask).unwrap();

    assert_eq!(
        sent_once(&sent),
        (
            "plays".to_string(),
            json!({ "signIn": "s-1", "server": "srv", "cursor": "c-9", "limit": MAX_PAGE_ROWS })
        )
    );
    assert_eq!(page.plays[0].played_at, 1_700_000_000);
}

#[test]
fn a_play_that_names_no_user_is_unreadable() {
    let (importers, _) = answering(json!({ "Ok": {
        "plays": [{ "id": "p1", "user": "", "title": "t1", "playedAt": 1 }],
    }}));
    let ask = PlaysAsk {
        sign_in: "s-1".into(),
        server: "srv".into(),
        cursor: None,
        changed_since: None,
    };

    let page = importers.plays(IMPORTER, &ask);

    assert_eq!(page, Err(Unanswered::Unreadable("an empty user id".into())));
}

#[test]
fn a_page_with_more_rows_than_the_core_asked_for_is_refused_whole() {
    let (importers, _) = answering(json!({ "Ok": { "titles": rows(MAX_PAGE_ROWS + 1) } }));

    let page = importers.titles(IMPORTER, &first_page());

    assert!(matches!(page, Err(Unanswered::Unreadable(why)) if why.contains("past the 500")));
}

#[test]
fn a_cursor_too_long_to_send_back_is_refused() {
    let (importers, _) = answering(json!({ "Ok": { "titles": [], "next": "c".repeat(4096) } }));

    let page = importers.titles(IMPORTER, &first_page());

    assert!(matches!(page, Err(Unanswered::Unreadable(_))));
}

#[test]
fn a_page_past_the_bytes_a_page_may_carry_is_never_parsed() {
    let (importers, _) = answering(json!({ "Ok": {
        "titles": [{ "id": "t1", "title": "x".repeat(PAGE.bytes) }],
    }}));

    let page = importers.titles(IMPORTER, &first_page());

    assert_eq!(
        page,
        Err(Unanswered::Unreadable(
            "an answer to titles past 4194304 bytes".into()
        ))
    );
}
