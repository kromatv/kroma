use super::*;

#[test]
fn the_record_holds_what_a_row_became_under_its_kind_and_its_scope() {
    let p = pool();
    ran(&p, "i1", 1);
    let server_id = server_key(IMPORTER, "srv");
    let ana = states_of(&server_id, "ana");

    record(&p, &ana, "i1", &[entry("t1", "f1", Some("item-1"))]).unwrap();

    let hers = brought(&p, &ana, &["t1", "t2"]).unwrap();
    let his = brought(&p, &states_of(&server_id, "ben"), &["t1"]).unwrap();
    assert_eq!(hers.len(), 1);
    assert_eq!(
        hers["t1"],
        Brought {
            fingerprint: "f1".into(),
            target: Some("item-1".into()),
        }
    );
    assert!(his.is_empty());
}

#[test]
fn a_row_recorded_again_unchanged_keeps_the_import_that_brought_it() {
    let p = pool();
    ran(&p, "i1", 1);
    ran(&p, "i2", 2);
    let server_id = server_key(IMPORTER, "srv");
    let ana = states_of(&server_id, "ana");
    record(
        &p,
        &ana,
        "i1",
        &[entry("t1", "f1", None), entry("t2", "f1", None)],
    )
    .unwrap();

    record(
        &p,
        &ana,
        "i2",
        &[entry("t1", "f1", None), entry("t2", "f2", None)],
    )
    .unwrap();

    assert_eq!(brought_by(&p, "t1"), "i1");
    assert_eq!(brought_by(&p, "t2"), "i2");
    assert_eq!(brought(&p, &ana, &["t2"]).unwrap()["t2"].fingerprint, "f2");
}

#[test]
fn a_row_recorded_without_a_target_keeps_the_one_it_had() {
    let p = pool();
    ran(&p, "i1", 1);
    let server_id = server_key(IMPORTER, "srv");
    let users = Ledger {
        server_id: &server_id,
        kind: Kind::User,
        scope: "",
    };
    record(&p, &users, "i1", &[entry("42", "f1", Some("account-1"))]).unwrap();

    record(&p, &users, "i1", &[entry("42", "f2", None)]).unwrap();

    let accounts = targets(&p, &server_id, Kind::User).unwrap();
    assert_eq!(accounts.get("42").map(String::as_str), Some("account-1"));
}

#[test]
fn a_title_is_read_back_as_the_other_server_last_described_it() {
    let p = pool();
    ran(&p, "i1", 1);
    let server_id = server_key(IMPORTER, "srv");
    describe(&p, &server_id, &[&film("t1", "Heat"), &film("t2", "Ronin")]).unwrap();

    describe(&p, &server_id, &[&film("t2", "Ronin (1998)")]).unwrap();

    let titles = described(&p, &server_id, &["t1", "t2", "t3"]).unwrap();
    assert_eq!(titles.len(), 2);
    assert_eq!(titles["t1"], film("t1", "Heat"));
    assert_eq!(titles["t2"], film("t2", "Ronin (1998)"));
}

#[test]
fn the_titles_an_import_matched_to_nothing_are_listed_once_each_in_windows() {
    let p = pool();
    ran(&p, "i1", 1);
    let server_id = server_key(IMPORTER, "srv");
    let films = [film("t1", "Heat"), film("t2", "Ronin"), film("t3", "Thief")];
    describe(&p, &server_id, &films.iter().collect::<Vec<_>>()).unwrap();
    add_unmatched(&p, "i1", &["t3", "t1"]).unwrap();

    add_unmatched(&p, "i1", &["t1", "t2"]).unwrap();

    let first = unmatched(
        &p,
        "i1",
        Window {
            offset: 0,
            limit: 2,
        },
    )
    .unwrap();
    let rest = unmatched(
        &p,
        "i1",
        Window {
            offset: 2,
            limit: 2,
        },
    )
    .unwrap();
    assert_eq!(first, vec![film("t1", "Heat"), film("t2", "Ronin")]);
    assert_eq!(rest, vec![film("t3", "Thief")]);
    assert_eq!(get(&p, "i1").unwrap().unwrap().unmatched_titles, 3);
}

#[test]
fn a_pass_remembers_when_its_last_whole_read_began() {
    let p = pool();
    ran(&p, "i1", 1);
    let server_id = server_key(IMPORTER, "srv");
    let never = pass_read_at(&p, &server_id, "plays").unwrap();
    set_pass_read_at(&p, &server_id, "plays", 1_700_000_000).unwrap();

    set_pass_read_at(&p, &server_id, "plays", 1_700_600_000).unwrap();

    assert_eq!(never, None);
    assert_eq!(
        pass_read_at(&p, &server_id, "plays").unwrap(),
        Some(1_700_600_000)
    );
}
