use rusqlite::params;

use kroma_domain::User;

use crate::accounts::identities::ProviderIdentity;
use crate::accounts::test_support::{mk_user, pool, waiting, FUTURE};
use crate::accounts::{
    access_token_user, access_token_user_by_id, create_access_token, create_reset,
    create_session, find_user_by_login, get_reset, identity_user, link_identity, list_users,
    renew_session, session_user, DeviceHints,
};
use crate::{insert_passkey, passkey_user_ids, Pool};

const ISSUER: &str = "https://id.test";

fn holding_every_credential(pool: &Pool) -> User {
    let ana = mk_user(pool, "ana@test.dev", "ana");
    create_access_token(pool, "device", &ana.id, FUTURE, true, &DeviceHints::default()).unwrap();
    create_session(pool, "session", &ana.id, FUTURE, Some("device")).unwrap();
    insert_passkey(pool, "key", &ana.id, "Phone", "{}").unwrap();
    let identity = ProviderIdentity {
        issuer: ISSUER,
        subject: "sub-ana",
        label: "ana@id.test",
    };
    link_identity(pool, &ana.id, &identity).unwrap();
    create_reset(pool, "reset", &ana.id, "code-hash", &ana.id, FUTURE).unwrap();
    ana
}

fn put_to_wait(pool: &Pool, user: &User) {
    pool.get()
        .unwrap()
        .execute("UPDATE users SET waiting = 1 WHERE id = ?1", params![user.id])
        .unwrap();
}

#[test]
fn every_credential_opens_the_account_until_it_waits() {
    let p = pool();
    let ana = holding_every_credential(&p);

    assert!(find_user_by_login(&p, "ana").unwrap().is_some());
    assert!(session_user(&p, "session").unwrap().is_some());
    assert!(access_token_user(&p, "device").unwrap().is_some());
    assert!(identity_user(&p, ISSUER, "sub-ana").unwrap().is_some());
    assert_eq!(passkey_user_ids(&p).unwrap(), [ana.id]);
    assert!(get_reset(&p, "reset").unwrap().is_some());
}

#[test]
fn a_waiting_account_is_not_found_by_its_name_or_its_address_at_sign_in() {
    let p = pool();
    let ana = holding_every_credential(&p);

    put_to_wait(&p, &ana);

    assert!(find_user_by_login(&p, "ana").unwrap().is_none());
    assert!(find_user_by_login(&p, "ana@test.dev").unwrap().is_none());
    assert!(list_users(&p).unwrap().is_empty());
}

#[test]
fn a_session_or_a_device_credential_of_a_waiting_account_resolves_to_nobody() {
    let p = pool();
    let ana = holding_every_credential(&p);

    put_to_wait(&p, &ana);

    assert!(session_user(&p, "session").unwrap().is_none());
    assert!(access_token_user(&p, "device").unwrap().is_none());
    let device = kroma_primitives::short_hash("device");
    assert!(access_token_user_by_id(&p, &device).unwrap().is_none());
}

#[test]
fn a_passkey_an_identity_or_a_reset_of_a_waiting_account_leads_nowhere() {
    let p = pool();
    let ana = holding_every_credential(&p);

    put_to_wait(&p, &ana);

    assert!(passkey_user_ids(&p).unwrap().is_empty());
    assert!(identity_user(&p, ISSUER, "sub-ana").unwrap().is_none());
    assert!(get_reset(&p, "reset").unwrap().is_none());
}

#[test]
fn no_session_and_no_device_credential_is_written_for_a_waiting_account() {
    let p = pool();
    let ana = waiting(&p, "ana", None);
    let hints = DeviceHints::default();

    let device = create_access_token(&p, "device", &ana.id, FUTURE, true, &hints);
    let session = create_session(&p, "session", &ana.id, FUTURE, None);
    let renewed = renew_session(&p, "renewed", &ana.id, FUTURE, "device", &hints);

    assert!(device.is_err());
    assert!(session.is_err());
    assert!(renewed.is_err());
    let conn = p.get().unwrap();
    let written: i64 = conn
        .query_row(
            "SELECT (SELECT COUNT(*) FROM sessions) + (SELECT COUNT(*) FROM access_tokens)",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(written, 0);
}
