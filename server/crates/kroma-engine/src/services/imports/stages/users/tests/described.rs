use super::*;

#[test]
fn a_kept_user_becomes_an_account_that_waits_under_their_name_and_address() {
    let house = household();

    let outcome = house.bring(&ben());

    let account = house.member(&account_of(&outcome));
    assert_eq!(account.username, "Ben");
    assert_eq!(account.email.as_deref(), Some("ben@example.test"));
    assert_eq!(account.permissions, [Permission::Playback]);
    assert!(db::account_waits(&house.state.db, &account.id).unwrap());
}

#[test]
fn a_user_who_saw_every_library_has_no_grant() {
    let house = household();

    let libraries = house.libraries_of(json!({ "id": "44", "name": "Cleo", "allLibraries": true }));

    assert_eq!(libraries, LibraryScope::All);
}

#[test]
fn a_user_sees_the_sources_their_libraries_became_and_no_other() {
    let house = household();

    let libraries = house.libraries_of(json!({
        "id": "44",
        "name": "Cleo",
        "libraries": ["2", "1", "3", "a-library-the-owner-left-out"],
    }));

    assert_eq!(
        libraries,
        LibraryScope::Only(vec!["shows".into(), "films".into()])
    );
}

#[test]
fn a_user_limited_by_rating_label_or_tag_has_a_grant_of_no_library() {
    let house = household();

    let by_rating = house.libraries_of(json!({
        "id": "44",
        "name": "Cleo",
        "allLibraries": true,
        "finerLimits": ["rating"],
    }));
    let by_label = house.libraries_of(json!({
        "id": "45",
        "name": "Dana",
        "libraries": ["1"],
        "finerLimits": ["label"],
    }));

    assert_eq!(by_rating, LibraryScope::Only(vec![]));
    assert_eq!(by_label, LibraryScope::Only(vec![]));
}

#[test]
fn a_user_none_of_whose_libraries_came_over_has_a_grant_of_no_library() {
    let house = household();

    let unkept = house.libraries_of(json!({ "id": "44", "name": "Cleo", "libraries": ["9"] }));
    let none = house.libraries_of(json!({ "id": "45", "name": "Dana" }));

    assert_eq!(unkept, LibraryScope::Only(vec![]));
    assert_eq!(none, LibraryScope::Only(vec![]));
}

#[test]
fn a_user_whose_state_is_locked_still_gets_an_account_and_their_libraries() {
    let house = household();

    let libraries = house.libraries_of(json!({
        "id": "44",
        "name": "Cleo",
        "libraries": ["2"],
        "stateLocked": true,
        "stateNeeds": "pin",
    }));

    assert_eq!(libraries, LibraryScope::Only(vec!["shows".into()]));
}

#[test]
fn a_name_another_account_holds_becomes_the_next_free_one() {
    let house = household();
    let namesake = user(json!({ "id": "44", "name": "Ana" }));
    let another = user(json!({ "id": "45", "name": "Ana" }));

    let outcomes = house.import(&[
        (&namesake, AccountChoice::Proposed),
        (&another, AccountChoice::Proposed),
    ]);

    let names: Vec<String> = outcomes
        .iter()
        .map(|outcome| house.member(&account_of(outcome)).username)
        .collect();
    assert_eq!(names, ["Ana2", "Ana3"]);
}

#[test]
fn a_user_with_no_name_of_their_own_is_named_after_their_address_or_as_a_member() {
    let house = household();
    let addressed = user(json!({ "id": "44", "name": " \n ", "email": "cleo@example.test" }));
    let named_by_address = user(json!({ "id": "45", "name": "dana@example.test" }));
    let nameless = user(json!({ "id": "46" }));
    let long = user(json!({ "id": "47", "name": "x".repeat(300) }));

    let outcomes = house.import(&[
        (&addressed, AccountChoice::Proposed),
        (&named_by_address, AccountChoice::Proposed),
        (&nameless, AccountChoice::Proposed),
        (&long, AccountChoice::Proposed),
    ]);

    let names: Vec<String> = outcomes
        .iter()
        .map(|outcome| house.member(&account_of(outcome)).username)
        .collect();
    assert_eq!(names[..3], ["cleo", "dana", "member"]);
    assert_eq!(names[3].chars().count(), 40);
}

#[test]
fn what_the_other_server_calls_an_address_and_is_none_is_not_kept() {
    let house = household();
    let no_at_sign = user(json!({ "id": "44", "name": "Cleo", "email": "cleo" }));
    let spaced = user(json!({ "id": "45", "name": "Dana", "email": "da na@example.test" }));
    let endless = user(json!({
        "id": "46",
        "name": "Eli",
        "email": format!("{}@example.test", "e".repeat(300)),
    }));
    let shouted = user(json!({ "id": "47", "name": "Fay", "email": " Fay@Example.test " }));

    let outcomes = house.import(&[
        (&no_at_sign, AccountChoice::Proposed),
        (&spaced, AccountChoice::Proposed),
        (&endless, AccountChoice::Proposed),
        (&shouted, AccountChoice::Proposed),
    ]);

    let addresses: Vec<Option<String>> = outcomes
        .iter()
        .map(|outcome| house.member(&account_of(outcome)).email)
        .collect();
    assert_eq!(
        addresses,
        [None, None, None, Some("fay@example.test".to_string())]
    );
}
