use super::*;

#[test]
fn a_second_import_finds_the_account_of_the_first_and_adds_none() {
    let house = household();
    let first = account_of(&house.bring(&ben()));
    let now_sees_more = user(json!({ "id": "43", "name": "Benny", "allLibraries": true }));

    let again = house.import(&[(&ben(), AccountChoice::New)]);
    let changed = house.import(&[(&now_sees_more, AccountChoice::Proposed)]);

    let account = house.member(&first);
    assert_eq!(again, [Outcome::AlreadyHere]);
    assert_eq!(changed, [Outcome::AlreadyHere]);
    assert_eq!(house.members().len(), 2);
    assert_eq!(account.username, "Ben");
    assert_eq!(account.libraries, LibraryScope::Only(vec!["films".into()]));
}

#[test]
fn a_row_offered_again_before_the_job_recorded_it_finds_the_account_it_made() {
    let house = household();
    let written = house.offer(&[(&ben(), AccountChoice::Proposed)]);

    let offered_again = house.offer(&[(&ben(), AccountChoice::Proposed)]);

    assert!(matches!(written[0], Outcome::Brought { target: Some(_) }));
    assert_eq!(offered_again, [Outcome::AlreadyHere]);
    assert_eq!(house.members().len(), 2);
}

#[test]
fn a_user_whose_account_the_owner_deleted_gets_a_new_one() {
    let house = household();
    let first = account_of(&house.bring(&ben()));
    let conn = house.state.db.get().unwrap();
    conn.execute("DELETE FROM users WHERE id = ?1", [&first])
        .unwrap();
    drop(conn);

    let second = account_of(&house.bring(&ben()));

    assert_ne!(second, first);
    assert_eq!(house.members().len(), 2);
    assert_eq!(house.member(&second).username, "Ben");
}
