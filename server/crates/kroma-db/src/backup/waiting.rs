use serde_json::{Map, Value};

use super::test_support::{data_dir, empty_doc, fresh_pool};
use super::{export_portable, import_portable};
use crate::{
    account_waits, claim_account, create_user, create_waiting_account, invite_waiting_account,
    invitee, user_by_id, AccountInvite, Awaited, Claim, Credential, Pool, WaitingAccount,
};
use kroma_domain::{LibraryScope, Permission};

const FUTURE: i64 = 9_999_999_999;

fn films() -> LibraryScope {
    LibraryScope::Only(vec!["films".into()])
}

fn a_waiting_account_with_its_invitation(pool: &Pool) -> String {
    let owner = create_user(pool, "o@test.dev", "owner", "hash", &Permission::all()).unwrap();
    let account = WaitingAccount {
        username: "ana",
        email: None,
        libraries: &films(),
    };
    let Awaited::Account(ana) = create_waiting_account(pool, &account).unwrap() else {
        panic!("ana should wait");
    };
    let invite = AccountInvite {
        token: "inv",
        user_id: &ana.id,
        created_by: &owner.id,
        expires_at: FUTURE,
    };
    invite_waiting_account(pool, &invite).unwrap();
    ana.id
}

#[test]
fn an_account_that_waits_comes_back_waiting_with_its_invitation() {
    let src = fresh_pool("waiting-src");
    let ana = a_waiting_account_with_its_invitation(&src);
    let doc = export_portable(&src, &data_dir(&src)).unwrap();
    let dst = fresh_pool("waiting-dst");

    import_portable(&dst, &data_dir(&dst), &doc, true).unwrap();

    assert!(account_waits(&dst, &ana).unwrap());
    assert_eq!(user_by_id(&dst, &ana).unwrap().unwrap().libraries, films());
    let named = invitee(&dst, "inv").unwrap().unwrap();
    assert_eq!((named.user_id.as_str(), named.email), (ana.as_str(), None));
}

#[test]
fn a_restored_invitation_still_gives_its_account_a_credential() {
    let src = fresh_pool("waiting-claim-src");
    let ana = a_waiting_account_with_its_invitation(&src);
    let doc = export_portable(&src, &data_dir(&src)).unwrap();
    let dst = fresh_pool("waiting-claim-dst");
    import_portable(&dst, &data_dir(&dst), &doc, true).unwrap();
    let claim = Claim {
        email: "ana@test.dev",
        username: None,
        credential: Credential::PasswordHash("chosen-hash"),
    };

    let claimed = claim_account(&dst, "inv", &claim).unwrap();

    assert_eq!(claimed.map(|user| user.id), Some(ana.clone()));
    assert!(!account_waits(&dst, &ana).unwrap());
}

#[test]
fn an_account_from_a_backup_taken_before_accounts_could_wait_does_not_wait() {
    let dst = fresh_pool("waiting-older");
    let mut doc = empty_doc();
    doc.tables.insert(
        "users".into(),
        vec![Map::from_iter(
            [
                ("id", "u1"),
                ("email", "a@b.c"),
                ("username", "Al"),
                ("password_hash", "ph"),
                ("created_at", "t"),
            ]
            .map(|(column, value)| (column.to_string(), Value::from(value))),
        )],
    );

    import_portable(&dst, &data_dir(&dst), &doc, false).unwrap();

    assert!(!account_waits(&dst, "u1").unwrap());
    assert_eq!(user_by_id(&dst, "u1").unwrap().unwrap().email, "a@b.c");
}
