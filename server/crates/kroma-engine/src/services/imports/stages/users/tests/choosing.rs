use super::*;

#[test]
fn the_person_who_signed_in_is_the_owner_and_no_account_is_created_for_them() {
    let house = household();
    let signed_in = user(json!({
        "id": "42",
        "name": "Ana on the other server",
        "signedIn": true,
        "libraries": ["1"],
    }));

    let outcome = house.import(&[(&signed_in, AccountChoice::New)]).remove(0);

    assert_eq!(account_of(&outcome), house.owner);
    assert_eq!(house.members().len(), 1);
    assert_eq!(house.member(&house.owner).libraries, LibraryScope::All);
}

#[test]
fn a_user_the_owner_attached_to_an_account_gets_that_account_as_it_stands() {
    let house = household();
    let pool = &house.state.db;
    let here = db::create_user(pool, "b@example.test", "Benjamin", "", &[]).unwrap();
    let shows = LibraryScope::Only(vec!["shows".into()]);
    db::set_user_libraries(pool, &here.id, &shows).unwrap();

    let outcome = house
        .import(&[(&ben(), AccountChoice::Existing(here.id.clone()))])
        .remove(0);

    let account = house.member(&here.id);
    assert_eq!(account_of(&outcome), here.id);
    assert_eq!(house.members().len(), 2);
    assert_eq!(account.libraries, shows);
    assert_eq!(account.invitation, None);
}

#[test]
fn a_user_is_proposed_the_account_that_holds_their_address() {
    let house = household();
    let here = db::create_user(&house.state.db, "Ben@Example.test", "Benjamin", "", &[]).unwrap();

    let outcome = house.bring(&ben());

    assert_eq!(account_of(&outcome), here.id);
    assert_eq!(house.members().len(), 2);
}

#[test]
fn an_address_several_kept_users_carry_proposes_no_account_and_is_given_to_none() {
    let house = household();
    let carrying =
        |id: &str, name: &str| user(json!({ "id": id, "name": name, "email": "ana@example.test" }));
    let (cleo, dana) = (carrying("44", "Cleo"), carrying("45", "Dana"));

    let outcomes = house.import(&[
        (&cleo, AccountChoice::Proposed),
        (&dana, AccountChoice::Proposed),
    ]);

    let accounts: Vec<AdminUser> = outcomes
        .iter()
        .map(|outcome| house.member(&account_of(outcome)))
        .collect();
    assert_eq!(house.members().len(), 3);
    assert_eq!(accounts[0].username, "Cleo");
    assert_eq!(accounts[1].username, "Dana");
    assert_eq!((&accounts[0].email, &accounts[1].email), (&None, &None));
}

#[test]
fn a_user_is_not_proposed_the_account_another_user_of_the_same_server_has() {
    let house = household();
    let first = account_of(&house.bring(&ben()));
    let later = user(json!({ "id": "44", "name": "Cleo", "email": "ben@example.test" }));

    let second = account_of(&house.bring(&later));

    assert_ne!(second, first);
    assert_eq!(house.member(&second).email, None);
}

#[test]
fn a_user_is_not_proposed_the_account_the_owner_attached_another_user_to() {
    let house = household();
    let here = db::create_user(&house.state.db, "ben@example.test", "Benjamin", "", &[]).unwrap();
    let cleo = user(json!({ "id": "44", "name": "Cleo" }));

    let outcomes = house.import(&[
        (&ben(), AccountChoice::Proposed),
        (&cleo, AccountChoice::Existing(here.id.clone())),
    ]);

    assert_ne!(account_of(&outcomes[0]), here.id);
    assert_eq!(account_of(&outcomes[1]), here.id);
    assert_eq!(house.members().len(), 3);
}

#[test]
fn a_user_who_carries_the_owner_s_address_is_not_proposed_the_account_of_who_signed_in() {
    let house = household();
    let carrying = user(json!({ "id": "44", "name": "Cleo", "email": "ana@example.test" }));
    let signed_in = user(json!({ "id": "42", "name": "Ana", "signedIn": true }));

    let outcomes = house.import(&[
        (&carrying, AccountChoice::Proposed),
        (&signed_in, AccountChoice::Proposed),
    ]);

    assert_ne!(account_of(&outcomes[0]), house.owner);
    assert_eq!(account_of(&outcomes[1]), house.owner);
}

#[test]
fn a_user_the_owner_wants_a_new_account_for_gets_one_without_the_address_another_holds() {
    let house = household();
    let here = db::create_user(&house.state.db, "ben@example.test", "Benjamin", "", &[]).unwrap();

    let outcome = house.import(&[(&ben(), AccountChoice::New)]).remove(0);

    let account = house.member(&account_of(&outcome));
    assert_ne!(account.id, here.id);
    assert_eq!(account.username, "Ben");
    assert_eq!(account.email, None);
}

#[test]
fn a_user_attached_to_an_account_that_is_gone_is_left_for_a_later_import() {
    let house = household();

    let outcomes = house.import(&[(&ben(), AccountChoice::Existing("nobody".into()))]);

    assert_eq!(outcomes, [Outcome::Untouched]);
    assert_eq!(house.members().len(), 1);
}
