use super::*;
use crate::admin::test_support::*;

#[test]
fn settings_upsert_and_readback() {
    let p = pool();
    assert!(settings_all(&p).unwrap().values.is_empty());
    settings_set(&p, "serverName", &serde_json::json!("My KROMA")).unwrap();
    settings_set(&p, "maxConcurrent", &serde_json::json!(3)).unwrap();
    settings_set(&p, "serverName", &serde_json::json!("Renamed")).unwrap();
    let all: std::collections::HashMap<String, serde_json::Value> =
        settings_all(&p).unwrap().values.into_iter().collect();
    assert_eq!(all.len(), 2);
    assert_eq!(all["serverName"], serde_json::json!("Renamed"));
    assert_eq!(all["maxConcurrent"], serde_json::json!(3));
}

#[test]
fn a_row_that_is_not_json_is_named_and_not_passed_over() {
    let p = pool();
    settings_set(&p, "serverName", &serde_json::json!("My KROMA")).unwrap();
    p.get()
        .unwrap()
        .execute(
            "INSERT INTO settings (key,value,updated_at) VALUES ('libraries','[{',?1)",
            params![now_or_blank()],
        )
        .unwrap();

    let stored = settings_all(&p).unwrap();

    assert_eq!(stored.values.len(), 1);
    assert_eq!(stored.unreadable, ["libraries"]);
}

#[test]
fn admin_users_roles_and_mutations() {
    let p = pool();
    let owner = crate::create_user(&p, "o@b.c", "owner", "h", &Permission::all()).unwrap();
    let member = crate::create_user(&p, "m@b.c", "member", "h", &[Permission::Playback]).unwrap();

    let admins = admin_users(&p).unwrap();
    assert_eq!(admins.len(), 2);
    let owner_row = admins.iter().find(|u| u.id == owner.id).unwrap();
    let member_row = admins.iter().find(|u| u.id == member.id).unwrap();
    assert_eq!(owner_row.role, "admin.roleOwner");
    assert_eq!(member_row.role, "admin.roleMember");
    assert!(!owner_row.online);
    assert!(owner_row.last_seen.is_none());

    assert_eq!(
        get_user(&p, &member.id).unwrap().unwrap().username,
        "member"
    );
    assert!(get_user(&p, "missing").unwrap().is_none());
    update_user_permissions(
        &p,
        &member.id,
        &[Permission::Playback, Permission::RequestsCreate],
    )
    .unwrap();
    assert!(get_user(&p, &member.id)
        .unwrap()
        .unwrap()
        .can(Permission::RequestsCreate));
    set_user_username(&p, &member.id, "renamed").unwrap();
    assert_eq!(
        get_user(&p, &member.id).unwrap().unwrap().username,
        "renamed"
    );
    touch_last_seen(&p, &member.id).unwrap();
    let after = admin_users(&p).unwrap();
    assert!(after
        .iter()
        .find(|u| u.id == member.id)
        .unwrap()
        .last_seen
        .is_some());

    delete_user(&p, &member.id).unwrap();
    assert_eq!(admin_users(&p).unwrap().len(), 1);
}

fn waiting(pool: &Pool, username: &str) -> String {
    let account = crate::WaitingAccount {
        username,
        email: None,
        libraries: &kroma_domain::LibraryScope::All,
    };
    match crate::create_waiting_account(pool, &account).unwrap() {
        crate::Awaited::Account(user) => user.id,
        other => panic!("{username} should wait, got {other:?}"),
    }
}

#[test]
fn an_account_that_waits_says_where_its_invitation_stands() {
    use kroma_domain::InvitationState::{Absent, Expired, Pending};
    let p = pool();
    let owner = crate::create_user(&p, "o@b.c", "owner", "h", &Permission::all()).unwrap();
    let invite = |token, user_id, expires_at| crate::AccountInvite {
        token,
        user_id,
        created_by: &owner.id,
        expires_at,
    };
    let (ana, bo, cy) = (waiting(&p, "ana"), waiting(&p, "bo"), waiting(&p, "cy"));
    crate::invite_waiting_account(&p, &invite("live", &ana, 9_999_999_999)).unwrap();
    crate::invite_waiting_account(&p, &invite("lapsed", &bo, 1)).unwrap();

    let listed = admin_users(&p).unwrap();

    let state = |id: &str| listed.iter().find(|u| u.id == id).unwrap().invitation;
    assert_eq!(state(&owner.id), None);
    assert_eq!(state(&ana), Some(Pending));
    assert_eq!(state(&bo), Some(Expired));
    assert_eq!(state(&cy), Some(Absent));
    let address = |id: &str| listed.iter().find(|u| u.id == id).unwrap().email.clone();
    assert_eq!(address(&owner.id).as_deref(), Some("o@b.c"));
    assert_eq!(address(&cy), None);
}
