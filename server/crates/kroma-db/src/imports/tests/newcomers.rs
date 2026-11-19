use kroma_domain::{InvitationState, LibraryScope};

use super::*;
use crate::{Awaited, WaitingAccount, account_waits, admin_users, create_user};

const FUTURE: i64 = 9_999_999_999;

fn ben<'a>(server_id: &'a str, libraries: &'a LibraryScope) -> Newcomer<'a> {
    Newcomer {
        server_id,
        user_id: "43",
        import_id: "i1",
        account: WaitingAccount {
            username: "Ben",
            email: Some("ben@example.test"),
            libraries,
        },
        invitation: None,
    }
}

fn accounts(pool: &Pool) -> i64 {
    crate::user_count(pool).unwrap()
}

#[test]
fn a_newcomer_gets_an_account_that_waits_and_the_record_says_whose_it_is() {
    let p = pool();
    ran(&p, "i1", 1);
    let server_id = server_key(IMPORTER, "srv");
    let films = LibraryScope::Only(vec!["films".into()]);

    let admitted = admit(&p, &ben(&server_id, &films)).unwrap();

    let Awaited::Account(account) = admitted else {
        panic!("Ben should have an account, got {admitted:?}");
    };
    assert!(account_waits(&p, &account.id).unwrap());
    assert_eq!(account.libraries, films);
    assert_eq!(
        targets(&p, &server_id, Kind::User).unwrap(),
        [("43".to_string(), account.id.clone())].into()
    );
    assert_eq!(brought_by(&p, "43"), "i1");
}

#[test]
fn a_newcomer_s_invitation_is_drafted_with_the_account() {
    let p = pool();
    ran(&p, "i1", 1);
    let owner = create_user(&p, "ana@example.test", "Ana", "", &[]).unwrap();
    let server_id = server_key(IMPORTER, "srv");
    let token = kroma_primitives::random_token();
    let newcomer = Newcomer {
        invitation: Some(Draft {
            token: &token,
            created_by: &owner.id,
            expires_at: FUTURE,
        }),
        ..ben(&server_id, &LibraryScope::All)
    };

    admit(&p, &newcomer).unwrap();

    let members = admin_users(&p).unwrap();
    let ben = members.iter().find(|m| m.username == "Ben").unwrap();
    assert_eq!(ben.invitation, Some(InvitationState::Pending));
    assert_eq!(crate::invitee(&p, &token).unwrap().unwrap().user_id, ben.id);
}

#[test]
fn a_newcomer_with_no_invitation_drafted_waits_with_none() {
    let p = pool();
    ran(&p, "i1", 1);
    let server_id = server_key(IMPORTER, "srv");

    admit(&p, &ben(&server_id, &LibraryScope::All)).unwrap();

    let members = admin_users(&p).unwrap();
    assert_eq!(members[0].invitation, Some(InvitationState::Absent));
}

#[test]
fn a_newcomer_whose_name_or_address_another_account_holds_writes_nothing() {
    let p = pool();
    ran(&p, "i1", 1);
    create_user(&p, "ben@example.test", "Benjamin", "", &[]).unwrap();
    create_user(&p, "other@example.test", "Ben", "", &[]).unwrap();
    let server_id = server_key(IMPORTER, "srv");
    let libraries = LibraryScope::All;
    let named_alike = Newcomer {
        account: WaitingAccount {
            username: "Ben",
            email: None,
            libraries: &libraries,
        },
        ..ben(&server_id, &libraries)
    };
    let addressed_alike = Newcomer {
        account: WaitingAccount {
            username: "Ben the second",
            email: Some("ben@example.test"),
            libraries: &libraries,
        },
        ..ben(&server_id, &libraries)
    };

    let by_name = admit(&p, &named_alike).unwrap();
    let by_address = admit(&p, &addressed_alike).unwrap();

    assert!(matches!(by_name, Awaited::UsernameTaken));
    assert!(matches!(by_address, Awaited::EmailTaken));
    assert_eq!(accounts(&p), 2);
    assert!(targets(&p, &server_id, Kind::User).unwrap().is_empty());
}

#[test]
fn a_newcomer_the_record_cannot_name_gets_no_account() {
    let p = pool();

    let refused = admit(&p, &ben("a-server-nobody-read", &LibraryScope::All));

    assert!(refused.is_err());
    assert_eq!(accounts(&p), 0);
}
