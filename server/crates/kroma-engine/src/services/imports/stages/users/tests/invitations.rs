use super::*;

#[test]
fn an_invitation_is_drafted_for_each_account_created_and_for_no_other() {
    let house = household();
    let here = db::create_user(&house.state.db, "d@example.test", "Dana", "", &[]).unwrap();
    let signed_in = user(json!({ "id": "42", "name": "Ana", "signedIn": true }));
    let cleo = user(json!({ "id": "44", "name": "Cleo", "allLibraries": true }));
    let dana = user(json!({ "id": "45", "name": "Dana" }));

    let outcomes = house.import(&[
        (&signed_in, AccountChoice::Proposed),
        (&ben(), AccountChoice::Proposed),
        (&cleo, AccountChoice::Proposed),
        (&dana, AccountChoice::Existing(here.id.clone())),
    ]);

    let invitations: Vec<Option<InvitationState>> = outcomes
        .iter()
        .map(|outcome| house.member(&account_of(outcome)).invitation)
        .collect();
    let drafted_by: Vec<Option<String>> = {
        let conn = house.state.db.get().unwrap();
        let mut stmt = conn.prepare("SELECT created_by FROM invites").unwrap();
        let rows = stmt.query_map([], |r| r.get(0)).unwrap();
        rows.map(Result::unwrap).collect()
    };
    assert_eq!(
        invitations,
        [
            None,
            Some(InvitationState::Pending),
            Some(InvitationState::Pending),
            None,
        ]
    );
    assert_eq!(drafted_by, vec![Some(house.owner.clone()); 2]);
}

#[test]
fn a_second_import_drafts_no_second_invitation() {
    let house = household();
    let account = account_of(&house.bring(&ben()));
    let drafted = |house: &Household| -> String {
        let conn = house.state.db.get().unwrap();
        conn.query_row("SELECT group_concat(token) FROM invites", [], |r| r.get(0))
            .unwrap()
    };
    let first = drafted(&house);

    house.bring(&ben());

    assert_eq!(drafted(&house), first);
    assert_eq!(
        house.member(&account).invitation,
        Some(InvitationState::Pending)
    );
}

#[test]
fn an_import_nobody_here_started_leaves_who_signed_in_and_drafts_no_invitation() {
    let house = a_household_nobody_here_started();
    let signed_in = user(json!({ "id": "42", "name": "Ana", "signedIn": true }));

    let outcomes = house.import(&[
        (&signed_in, AccountChoice::Proposed),
        (&ben(), AccountChoice::Proposed),
    ]);

    assert_eq!(outcomes[0], Outcome::Untouched);
    assert_eq!(
        house.member(&account_of(&outcomes[1])).invitation,
        Some(InvitationState::Absent)
    );
}
