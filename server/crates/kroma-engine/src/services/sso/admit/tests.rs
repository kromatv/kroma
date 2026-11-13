use kroma_domain::Permission;

use super::*;
use crate::db::testing::TempPool;

const ISSUER: &str = "https://id.test";
const NOW: i64 = 1_800_000_000;

fn pool() -> TempPool {
    crate::db::testing::temp_pool("sso-admit")
}

fn provider() -> Provider {
    Provider {
        id: "p0".into(),
        ..Provider::default()
    }
}

fn lea() -> Identity {
    Identity {
        issuer: ISSUER.into(),
        person: Person {
            subject: "sub-lea".into(),
            username: Some("lea".into()),
            email: Some("lea@id.test".into()),
            name: Some("Léa".into()),
            groups: vec!["family".into()],
        },
    }
}

fn signing_in() -> Intent {
    Intent::SignIn { invite: None }
}

fn member(pool: &Pool, email: &str, username: &str) -> String {
    db::create_user(pool, email, username, "hash", &[Permission::Playback])
        .unwrap()
        .id
}

fn admitted(pool: &Pool, provider: &Provider, identity: Identity, intent: &Intent) -> Outcome {
    admit(pool, provider, identity, intent, NOW).unwrap()
}

fn invite(pool: &Pool, permissions: &[Permission]) -> String {
    let owner = member(pool, "owner@test.dev", "owner");
    db::create_invite(pool, "invite-token", permissions, &owner, NOW + 3600).unwrap();
    "invite-token".to_string()
}

#[test]
fn a_linked_identity_signs_in_as_its_account() {
    let p = pool();
    let user = member(&p, "lea@test.dev", "lea");
    link(&p, &user, &lea()).unwrap();

    let outcome = admitted(&p, &provider(), lea(), &signing_in());

    assert_eq!(
        outcome,
        Outcome::SignedIn {
            user_id: user,
            created: false
        }
    );
}

#[test]
fn a_stranger_becomes_a_join_request_and_asking_again_files_no_second_one() {
    let p = pool();

    let first = admitted(&p, &provider(), lea(), &signing_in());
    let again = admitted(&p, &provider(), lea(), &signing_in());

    assert_eq!(
        first,
        Outcome::Waiting(Waiting::Requested { filed: true }, lea())
    );
    assert_eq!(
        again,
        Outcome::Waiting(Waiting::Requested { filed: false }, lea())
    );
    let waiting = db::list_join_requests(&p, false).unwrap();
    assert_eq!(waiting.len(), 1);
    assert_eq!(waiting[0].username, "lea");
    assert_eq!(db::user_count(&p).unwrap(), 0);
}

#[test]
fn a_declined_identity_is_refused() {
    let p = pool();
    admitted(&p, &provider(), lea(), &signing_in());
    let id = db::list_join_requests(&p, false).unwrap().remove(0).id;
    db::block_join_request(&p, &id).unwrap();

    let outcome = admitted(&p, &provider(), lea(), &signing_in());

    assert_eq!(outcome, Outcome::Refused(Refusal::Blocked));
}

#[test]
fn a_full_waiting_list_refuses_the_next_stranger() {
    let p = pool();
    for n in 0..MAX_WAITING_REQUESTS {
        let mut someone = lea();
        someone.person.subject = format!("sub-{n}");
        someone.person.email = Some(format!("{n}@id.test"));
        admitted(&p, &provider(), someone, &signing_in());
    }

    let outcome = admitted(&p, &provider(), lea(), &signing_in());

    assert_eq!(outcome, Outcome::Refused(Refusal::Full));
}

#[test]
fn a_provider_that_creates_accounts_gives_its_own_permissions_and_libraries() {
    let p = pool();
    let mut open = provider();
    open.new_people = NewPeople::Create;
    open.permissions = vec![Permission::Playback, Permission::RequestsCreate];
    open.libraries = LibraryScope::Only(vec!["films".into()]);

    let outcome = admitted(&p, &open, lea(), &signing_in());

    let Outcome::SignedIn { user_id, created } = outcome else {
        panic!("expected an account, got {outcome:?}");
    };
    assert!(created);
    let user = db::user_by_id(&p, &user_id).unwrap().unwrap();
    assert_eq!(user.username, "lea");
    assert_eq!(user.email, "lea@id.test");
    assert_eq!(user.permissions, open.permissions);
    assert_eq!(user.libraries, open.libraries);
}

#[test]
fn a_username_already_taken_gets_the_next_free_number() {
    let p = pool();
    member(&p, "a@test.dev", "lea");
    member(&p, "b@test.dev", "lea2");
    let mut open = provider();
    open.new_people = NewPeople::Create;

    let outcome = admitted(&p, &open, lea(), &signing_in());

    let Outcome::SignedIn { user_id, .. } = outcome else {
        panic!("expected an account, got {outcome:?}");
    };
    assert_eq!(db::user_by_id(&p, &user_id).unwrap().unwrap().username, "lea3");
}

#[test]
fn an_email_another_account_holds_never_creates_or_links_anything() {
    let p = pool();
    let existing = member(&p, "lea@id.test", "someone");
    let mut open = provider();
    open.new_people = NewPeople::Create;

    let outcome = admitted(&p, &open, lea(), &signing_in());

    assert_eq!(outcome, Outcome::Waiting(Waiting::EmailTaken, lea()));
    assert_eq!(db::user_count(&p).unwrap(), 1);
    assert!(db::list_identities(&p, &existing).unwrap().is_empty());
}

#[test]
fn an_invitation_only_provider_turns_a_stranger_away_without_filing_anything() {
    let p = pool();
    let mut closed = provider();
    closed.new_people = NewPeople::Invite;

    let outcome = admitted(&p, &closed, lea(), &signing_in());

    assert_eq!(outcome, Outcome::Waiting(Waiting::InvitationOnly, lea()));
    assert!(db::list_join_requests(&p, false).unwrap().is_empty());
}

#[test]
fn an_invitation_creates_the_account_with_the_invitations_permissions() {
    let p = pool();
    let token = invite(&p, &[Permission::Playback, Permission::RequestsCreate]);
    let mut closed = provider();
    closed.new_people = NewPeople::Invite;

    let outcome = admitted(&p, &closed, lea(), &Intent::SignIn { invite: Some(token) });

    let Outcome::SignedIn { user_id, created } = outcome else {
        panic!("expected an account, got {outcome:?}");
    };
    assert!(created);
    let user = db::user_by_id(&p, &user_id).unwrap().unwrap();
    assert_eq!(
        user.permissions,
        [Permission::Playback, Permission::RequestsCreate]
    );
    assert!(db::get_invite(&p, "invite-token").unwrap().unwrap().used);
}

#[test]
fn a_spent_or_unknown_invitation_is_refused() {
    let p = pool();
    let intent = Intent::SignIn {
        invite: Some("made-up".into()),
    };

    let outcome = admitted(&p, &provider(), lea(), &intent);

    assert_eq!(outcome, Outcome::Refused(Refusal::InviteInvalid));
    assert_eq!(db::user_count(&p).unwrap(), 0);
}

#[test]
fn an_account_that_signs_in_with_an_invitation_in_hand_leaves_it_unspent() {
    let p = pool();
    let token = invite(&p, &[Permission::Playback]);
    let user = member(&p, "lea@test.dev", "lea");
    link(&p, &user, &lea()).unwrap();

    admitted(&p, &provider(), lea(), &Intent::SignIn { invite: Some(token) });

    assert!(!db::get_invite(&p, "invite-token").unwrap().unwrap().used);
}

#[test]
fn a_person_outside_the_required_groups_is_refused_even_with_an_account() {
    let p = pool();
    let user = member(&p, "lea@test.dev", "lea");
    link(&p, &user, &lea()).unwrap();
    let mut strict = provider();
    strict.required_groups = vec!["admins".into()];

    let outcome = admitted(&p, &strict, lea(), &signing_in());

    assert_eq!(outcome, Outcome::Refused(Refusal::Group));
}

#[test]
fn a_provider_with_no_email_to_give_cannot_create_an_account() {
    let p = pool();
    let mut anonymous = lea();
    anonymous.person.email = None;

    let outcome = admitted(&p, &provider(), anonymous, &signing_in());

    assert_eq!(outcome, Outcome::Refused(Refusal::NoEmail));
}

#[test]
fn linking_gives_the_identity_to_the_account_and_drops_its_join_request() {
    let p = pool();
    admitted(&p, &provider(), lea(), &signing_in());
    let user = member(&p, "lea@test.dev", "lea");

    let outcome = admitted(&p, &provider(), lea(), &Intent::Link { user_id: user.clone() });
    let again = admitted(&p, &provider(), lea(), &Intent::Link { user_id: user.clone() });

    assert_eq!(outcome, Outcome::Linked);
    assert_eq!(again, Outcome::Linked);
    assert!(db::list_join_requests(&p, false).unwrap().is_empty());
    assert_eq!(db::list_identities(&p, &user).unwrap()[0].label, "lea@id.test");
}

#[test]
fn an_identity_that_belongs_to_someone_else_cannot_be_linked() {
    let p = pool();
    let first = member(&p, "a@test.dev", "a");
    let second = member(&p, "b@test.dev", "b");
    link(&p, &first, &lea()).unwrap();

    let outcome = admitted(&p, &provider(), lea(), &Intent::Link { user_id: second });

    assert_eq!(outcome, Outcome::Refused(Refusal::LinkedElsewhere));
}

#[test]
fn a_test_reports_the_person_and_admits_nobody() {
    let p = pool();
    let mut strict = provider();
    strict.required_groups = vec!["admins".into()];
    let intent = Intent::Test {
        user_id: "admin".into(),
    };

    let outcome = admitted(&p, &strict, lea(), &intent);

    assert_eq!(
        outcome,
        Outcome::Tested(TestReport {
            person: lea().person,
            admitted: false
        })
    );
    assert_eq!(db::user_count(&p).unwrap(), 0);
    assert!(db::list_join_requests(&p, false).unwrap().is_empty());
}

fn approval<'a>(username: Option<&'a str>, libraries: &'a LibraryScope) -> Approval<'a> {
    Approval {
        username,
        permissions: &[Permission::Playback, Permission::RequestsCreate],
        libraries,
    }
}

fn waiting_request(pool: &Pool) -> String {
    admitted(pool, &provider(), lea(), &signing_in());
    db::list_join_requests(pool, false).unwrap().remove(0).id
}

#[test]
fn approving_a_request_creates_the_account_the_identity_then_signs_in_as() {
    let p = pool();
    let request = waiting_request(&p);
    let films = LibraryScope::Only(vec!["films".into()]);

    let approved = approve(&p, &request, &approval(None, &films)).unwrap();

    let Approved::Member(user) = approved else {
        panic!("expected a member, got {approved:?}");
    };
    assert_eq!(user.username, "lea");
    assert_eq!(user.libraries, films);
    assert!(db::list_join_requests(&p, false).unwrap().is_empty());
    assert_eq!(
        admitted(&p, &provider(), lea(), &signing_in()),
        Outcome::SignedIn {
            user_id: user.id.clone(),
            created: false
        }
    );
}

#[test]
fn an_admin_may_name_the_account_and_a_taken_name_is_refused() {
    let p = pool();
    member(&p, "a@test.dev", "taken");
    let request = waiting_request(&p);

    let clash = approve(&p, &request, &approval(Some("taken"), &LibraryScope::All)).unwrap();
    let named = approve(&p, &request, &approval(Some(" Léa "), &LibraryScope::All)).unwrap();

    assert!(matches!(clash, Approved::UsernameTaken));
    assert!(matches!(named, Approved::Member(user) if user.username == "Léa"));
}

#[test]
fn a_request_whose_email_was_taken_meanwhile_is_not_approved() {
    let p = pool();
    let request = waiting_request(&p);
    member(&p, "lea@id.test", "someone");

    let approved = approve(&p, &request, &approval(None, &LibraryScope::All)).unwrap();

    assert!(matches!(approved, Approved::EmailTaken));
    assert_eq!(db::list_join_requests(&p, false).unwrap().len(), 1);
}

#[test]
fn a_declined_or_unknown_request_cannot_be_approved() {
    let p = pool();
    let request = waiting_request(&p);
    db::block_join_request(&p, &request).unwrap();

    let declined = approve(&p, &request, &approval(None, &LibraryScope::All)).unwrap();
    let unknown = approve(&p, "made-up", &approval(None, &LibraryScope::All)).unwrap();

    assert!(matches!(declined, Approved::Gone));
    assert!(matches!(unknown, Approved::Gone));
    assert_eq!(db::user_count(&p).unwrap(), 0);
}
