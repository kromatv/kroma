use rusqlite::params;

use super::*;
use crate::accounts::test_support::*;
use crate::accounts::{
    consume_invite, create_access_token, create_invite, find_user_by_login, get_invite,
    identity_user, list_invites, sign_in_means, DeviceHints,
};

fn invited(pool: &Pool, token: &str, user: &User, admin: &User) -> bool {
    invited_until(pool, token, user, admin, FUTURE)
}

fn invited_until(pool: &Pool, token: &str, user: &User, admin: &User, expires_at: i64) -> bool {
    let invite = AccountInvite {
        token,
        user_id: &user.id,
        created_by: &admin.id,
        expires_at,
    };
    invite_waiting_account(pool, &invite).unwrap()
}

fn with_password<'a>(email: &'a str, username: &'a str) -> Claim<'a> {
    Claim {
        email,
        username: Some(username),
        credential: Credential::PasswordHash("chosen-hash"),
    }
}

fn stored_address(pool: &Pool, user_id: &str) -> Option<String> {
    pool.get()
        .unwrap()
        .query_row(
            "SELECT email FROM users WHERE id = ?1",
            params![user_id],
            |r| r.get(0),
        )
        .unwrap()
}

#[test]
fn an_account_waits_with_a_name_its_visibility_and_no_credential() {
    let p = pool();

    let ana = waiting(&p, "ana", None);

    assert!(account_waits(&p, &ana.id).unwrap());
    let kept = user_by_id(&p, &ana.id).unwrap().unwrap();
    assert_eq!(kept.username, "ana");
    assert_eq!(kept.libraries, films());
    assert_eq!(kept.permissions, vec![Permission::Playback]);
    let means = sign_in_means(&p, &ana.id).unwrap();
    assert_eq!((means.password, means.passkeys), (false, 0));
    assert!(means.identities.is_empty());
}

#[test]
fn accounts_wait_without_an_address_side_by_side_and_a_blank_one_is_none() {
    let p = pool();

    let ana = waiting(&p, "ana", None);
    let bo = waiting(&p, "bo", Some("   "));
    let cy = waiting(&p, "cy", Some("cy@test.dev"));

    assert_eq!(stored_address(&p, &ana.id), None);
    assert_eq!(stored_address(&p, &bo.id), None);
    assert_eq!(stored_address(&p, &cy.id).as_deref(), Some("cy@test.dev"));
}

#[test]
fn a_name_or_an_address_another_account_holds_makes_no_waiting_account() {
    let p = pool();
    mk_user(&p, "ana@test.dev", "ana");
    let all = LibraryScope::All;
    let asked = |username, email| WaitingAccount {
        username,
        email,
        libraries: &all,
    };

    let same_name = create_waiting_account(&p, &asked("ana", None)).unwrap();
    let same_address = create_waiting_account(&p, &asked("bo", Some("ANA@test.dev"))).unwrap();
    let nameless = create_waiting_account(&p, &asked("  ", None));

    assert!(matches!(same_name, Awaited::UsernameTaken));
    assert!(matches!(same_address, Awaited::EmailTaken));
    assert!(nameless.is_err());
    assert_eq!(crate::user_count(&p).unwrap(), 1);
}

#[test]
fn an_account_that_does_not_wait_gets_no_invitation() {
    let p = pool();
    let admin = mk_user(&p, "o@test.dev", "owner");

    let settled = invited(&p, "inv", &admin, &admin);

    assert!(!settled);
    assert!(get_invite(&p, "inv").unwrap().is_none());
    assert!(!account_waits(&p, "nobody").unwrap());
}

#[test]
fn a_new_invitation_voids_the_one_before_and_the_account_goes_on_waiting() {
    let p = pool();
    let admin = mk_user(&p, "o@test.dev", "owner");
    let ana = waiting(&p, "ana", None);
    invited(&p, "first", &ana, &admin);

    let minted = invited(&p, "second", &ana, &admin);

    assert!(minted);
    assert!(invitee(&p, "first").unwrap().is_none());
    assert!(claim_account(&p, "first", &with_password("ana@test.dev", "ana"))
        .unwrap()
        .is_none());
    assert_eq!(invitee(&p, "second").unwrap().unwrap().user_id, ana.id);
    assert!(account_waits(&p, &ana.id).unwrap());
}

#[test]
fn an_invitation_names_the_person_it_waits_for() {
    let p = pool();
    let admin = mk_user(&p, "o@test.dev", "owner");
    let ana = waiting(&p, "ana", Some("ana@old.test"));
    invited(&p, "inv", &ana, &admin);
    create_invite(&p, "open", &[Permission::Playback], &admin.id, FUTURE).unwrap();

    let named = invitee(&p, "inv").unwrap();

    assert_eq!(
        named,
        Some(Invitee {
            user_id: ana.id,
            username: "ana".into(),
            email: Some("ana@old.test".into()),
        })
    );
    assert!(invitee(&p, "open").unwrap().is_none());
    assert!(invitee(&p, "unknown").unwrap().is_none());
}

#[test]
fn redeeming_gives_the_same_account_its_credential_its_name_and_its_address() {
    let p = pool();
    let admin = mk_user(&p, "o@test.dev", "owner");
    let ana = waiting(&p, "ana", Some("ana@old.test"));
    invited(&p, "inv", &ana, &admin);

    let claimed = claim_account(&p, "inv", &with_password("ana@new.test", "anabel"))
        .unwrap()
        .expect("the account is claimed");

    assert_eq!(claimed.id, ana.id);
    assert_eq!(claimed.username, "anabel");
    assert_eq!(claimed.email, "ana@new.test");
    assert_eq!(claimed.libraries, films());
    assert_eq!(claimed.created_at, ana.created_at);
    assert!(!account_waits(&p, &ana.id).unwrap());
    let (found, hash) = find_user_by_login(&p, "anabel").unwrap().unwrap();
    assert_eq!((found.id, hash.as_str()), (ana.id.clone(), "chosen-hash"));
    create_access_token(&p, "device", &ana.id, FUTURE, true, &DeviceHints::default()).unwrap();
}

#[test]
fn what_a_waiting_account_held_is_still_its_own_once_redeemed() {
    let p = pool();
    let admin = mk_user(&p, "o@test.dev", "owner");
    let ana = waiting(&p, "ana", None);
    invited(&p, "inv", &ana, &admin);
    p.get()
        .unwrap()
        .execute_batch(&format!(
            "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('{FILMS}','Films','movie','/x','t'); \
             INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('dune','movie','Dune','mkv','{FILMS}','t'); \
             INSERT INTO progress (user_id,item_id,position_ms,updated_at) VALUES ('{}','dune',4200,'t');",
            ana.id
        ))
        .unwrap();

    claim_account(&p, "inv", &with_password("ana@test.dev", "ana")).unwrap();

    let position: i64 = p
        .get()
        .unwrap()
        .query_row(
            "SELECT position_ms FROM progress WHERE user_id = ?1 AND item_id = 'dune'",
            params![ana.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(position, 4200);
}

#[test]
fn an_invitation_is_spent_once_and_an_expired_one_never() {
    let p = pool();
    let admin = mk_user(&p, "o@test.dev", "owner");
    let ana = waiting(&p, "ana", None);
    let bo = waiting(&p, "bo", None);
    invited(&p, "inv", &ana, &admin);
    invited_until(&p, "lapsed", &bo, &admin, 1);

    let first = claim_account(&p, "inv", &with_password("ana@test.dev", "ana")).unwrap();
    let again = claim_account(&p, "inv", &with_password("eve@test.dev", "eve")).unwrap();
    let late = claim_account(&p, "lapsed", &with_password("bo@test.dev", "bo")).unwrap();

    assert!(first.is_some());
    assert!(again.is_none());
    assert!(late.is_none());
    assert!(account_waits(&p, &bo.id).unwrap());
    assert!(invitee(&p, "lapsed").unwrap().is_none());
}

#[test]
fn redeeming_through_a_provider_links_the_identity_and_keeps_the_name() {
    let p = pool();
    let admin = mk_user(&p, "o@test.dev", "owner");
    let ana = waiting(&p, "ana", None);
    invited(&p, "inv", &ana, &admin);
    let identity = ProviderIdentity {
        issuer: "https://id.test",
        subject: "sub-ana",
        label: "ana@id.test",
    };
    let claim = Claim {
        email: "ana@id.test",
        username: None,
        credential: Credential::Identity(&identity),
    };

    let claimed = claim_account(&p, "inv", &claim).unwrap().unwrap();

    assert_eq!((claimed.id.as_str(), claimed.username.as_str()), (ana.id.as_str(), "ana"));
    let signed_in = identity_user(&p, "https://id.test", "sub-ana").unwrap();
    assert_eq!(signed_in.map(|user| user.id), Some(ana.id.clone()));
    assert!(!sign_in_means(&p, &ana.id).unwrap().password);
}

#[test]
fn a_claim_another_account_stands_in_the_way_of_leaves_the_invitation_unspent() {
    let p = pool();
    let admin = mk_user(&p, "o@test.dev", "owner");
    let ana = waiting(&p, "ana", None);
    invited(&p, "inv", &ana, &admin);

    let collided = claim_account(&p, "inv", &with_password("o@test.dev", "ana"));

    assert!(collided.is_err());
    assert!(account_waits(&p, &ana.id).unwrap());
    assert_eq!(invitee(&p, "inv").unwrap().unwrap().user_id, ana.id);
}

#[test]
fn an_accounts_invitation_creates_nobody_and_an_open_one_claims_nobody() {
    let p = pool();
    let admin = mk_user(&p, "o@test.dev", "owner");
    let ana = waiting(&p, "ana", None);
    invited(&p, "bound", &ana, &admin);
    create_invite(&p, "open", &[Permission::Playback], &admin.id, FUTURE).unwrap();

    let created = consume_invite(&p, "bound").unwrap();
    let claimed = claim_account(&p, "open", &with_password("eve@test.dev", "eve")).unwrap();

    assert!(created.is_none());
    assert!(claimed.is_none());
    assert!(!get_invite(&p, "bound").unwrap().unwrap().used);
    assert!(!get_invite(&p, "open").unwrap().unwrap().used);
    let listed: Vec<String> = list_invites(&p).unwrap().into_iter().map(|i| i.token).collect();
    assert_eq!(listed, ["open"]);
}

#[test]
fn removing_a_waiting_account_takes_its_invitation_with_it() {
    let p = pool();
    let admin = mk_user(&p, "o@test.dev", "owner");
    let ana = waiting(&p, "ana", None);
    invited(&p, "inv", &ana, &admin);

    crate::delete_user(&p, &ana.id).unwrap();

    assert!(get_invite(&p, "inv").unwrap().is_none());
}
