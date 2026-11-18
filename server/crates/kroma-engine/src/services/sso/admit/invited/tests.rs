use kroma_domain::{LibraryScope, Permission};

use super::super::tests::{admitted, lea, member, pool, provider};
use super::super::{link, Intent, Outcome, Refusal, Waiting};
use crate::db::{self, Pool};
use crate::services::settings::NewPeople;

const NOW: i64 = 1_800_000_000;
const INVITE: &str = "account-invite";

fn waiting(pool: &Pool, username: &str, email: Option<&str>) -> String {
    let account = db::WaitingAccount {
        username,
        email,
        libraries: &LibraryScope::Only(vec!["films".into()]),
    };
    match db::create_waiting_account(pool, &account).unwrap() {
        db::Awaited::Account(user) => user.id,
        other => panic!("{username} should wait, got {other:?}"),
    }
}

fn invited(pool: &Pool, user_id: &str, expires_at: i64) -> Intent {
    let owner = member(pool, "owner@test.dev", "owner");
    let invite = db::AccountInvite {
        token: INVITE,
        user_id,
        created_by: &owner,
        expires_at,
    };
    assert!(db::invite_waiting_account(pool, &invite).unwrap());
    Intent::SignIn {
        invite: Some(INVITE.into()),
    }
}

#[test]
fn the_invitation_of_a_waiting_account_gives_that_account_the_identity() {
    let p = pool();
    let account = waiting(&p, "lea-from-plex", None);
    let intent = invited(&p, &account, NOW * 2);

    let outcome = admitted(&p, &provider(), lea(), &intent);

    assert_eq!(
        outcome,
        Outcome::SignedIn {
            user_id: account.clone(),
            created: true
        }
    );
    let user = db::user_by_id(&p, &account).unwrap().unwrap();
    assert_eq!(user.username, "lea-from-plex");
    assert_eq!(user.email, "lea@id.test");
    assert_eq!(user.libraries, LibraryScope::Only(vec!["films".into()]));
    assert!(!db::account_waits(&p, &account).unwrap());
    let again = admitted(&p, &provider(), lea(), &Intent::SignIn { invite: None });
    assert_eq!(
        again,
        Outcome::SignedIn {
            user_id: account,
            created: false
        }
    );
    assert_eq!(db::user_count(&p).unwrap(), 2);
}

#[test]
fn an_account_that_waits_under_the_providers_address_is_claimed_with_it() {
    let p = pool();
    let account = waiting(&p, "lea", Some("lea@id.test"));
    let intent = invited(&p, &account, NOW * 2);

    let outcome = admitted(&p, &provider(), lea(), &intent);

    assert!(matches!(outcome, Outcome::SignedIn { user_id, .. } if user_id == account));
}

#[test]
fn a_waiting_account_under_the_providers_address_is_not_signed_in_to_without_its_invitation() {
    let p = pool();
    let account = waiting(&p, "lea", Some("lea@id.test"));
    let mut open = provider();
    open.new_people = NewPeople::Create;

    let outcome = admitted(&p, &open, lea(), &Intent::SignIn { invite: None });

    assert_eq!(outcome, Outcome::Waiting(Waiting::EmailTaken, lea()));
    assert!(db::account_waits(&p, &account).unwrap());
    assert!(db::list_identities(&p, &account).unwrap().is_empty());
}

#[test]
fn an_identity_on_an_account_that_waits_does_not_sign_in_as_it() {
    let p = pool();
    let user = member(&p, "lea@test.dev", "lea");
    link(&p, &user, &lea()).unwrap();
    p.get()
        .unwrap()
        .execute("UPDATE users SET waiting = 1 WHERE id = ?1", [&user])
        .unwrap();

    let outcome = admitted(&p, &provider(), lea(), &Intent::SignIn { invite: None });

    assert!(!matches!(outcome, Outcome::SignedIn { .. }), "{outcome:?}");
}

#[test]
fn a_lapsed_invitation_of_a_waiting_account_is_refused_and_creates_nobody() {
    let p = pool();
    let account = waiting(&p, "lea", None);
    let intent = invited(&p, &account, 1);

    let outcome = admitted(&p, &provider(), lea(), &intent);

    assert_eq!(outcome, Outcome::Refused(Refusal::InviteInvalid));
    assert!(db::account_waits(&p, &account).unwrap());
    assert_eq!(db::user_count(&p).unwrap(), 2);
    assert_eq!(
        db::user_by_id(&p, &account)
            .unwrap()
            .unwrap()
            .permissions,
        [Permission::Playback]
    );
}
