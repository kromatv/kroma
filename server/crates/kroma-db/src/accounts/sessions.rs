//! A signed-in session, and revoking the ones that are not this device.

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

use kroma_domain::User;

use super::access_tokens::{touch_access_token, DeviceHints};
use crate::admin::mark_last_seen;
use crate::rows::row_to_user;
use crate::{now_or_blank, Pool};

/// `access_token` records the device credential this session was minted from,
/// so the account's session list can flag the current device. The user's
/// expired sessions go in the same call, so renewing never piles them up.
pub fn create_session(
    pool: &Pool,
    token: &str,
    user_id: &str,
    expires_at: i64,
    access_token: Option<&str>,
) -> Result<()> {
    insert_session(&*pool.get()?, token, user_id, expires_at, access_token)
}

/// A device trading its credential for a fresh session, in one IMMEDIATE
/// transaction so the exchange waits on a single commit: the account and the
/// device are stamped as seen, the device takes the labels `hints` carry, and
/// the session is stored as [`create_session`] stores it.
pub fn renew_session(
    pool: &Pool,
    token: &str,
    user_id: &str,
    expires_at: i64,
    access_token: &str,
    hints: &DeviceHints,
) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    mark_last_seen(&tx, user_id)?;
    touch_access_token(&tx, access_token, hints)?;
    insert_session(&tx, token, user_id, expires_at, Some(access_token))?;
    tx.commit()?;
    Ok(())
}

fn insert_session(
    conn: &Connection,
    token: &str,
    user_id: &str,
    expires_at: i64,
    access_token: Option<&str>,
) -> Result<()> {
    conn.execute(
        "DELETE FROM sessions WHERE user_id = ?1 AND expires_at <= ?2",
        params![user_id, time::OffsetDateTime::now_utc().unix_timestamp()],
    )?;
    conn.execute(
        "INSERT INTO sessions (token,user_id,created_at,expires_at,access_token) VALUES (?1,?2,?3,?4,?5)",
        params![token, user_id, now_or_blank(), expires_at, access_token],
    )?;
    Ok(())
}

/// The non-secret `short_hash` of the device credential a live session was
/// minted from, so the handler never touches the raw token. `None` when the
/// session predates parent-token tracking.
pub fn session_device_id(pool: &Pool, token: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let access = conn
        .query_row(
            "SELECT access_token FROM sessions WHERE token = ?1",
            params![token],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten();
    Ok(access.map(|t| kroma_primitives::short_hash(&t)))
}

/// Resolve a session token to its user; expired sessions resolve to `None`.
pub fn session_user(pool: &Pool, token: &str) -> Result<Option<User>> {
    let conn = pool.get()?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let mut stmt = conn.prepare(
        "SELECT u.id,u.email,u.username,u.avatar_url,u.created_at,u.permissions,u.language,(u.pin_hash IS NOT NULL),u.audio_language,u.subtitle_language,u.libraries \
         FROM sessions s JOIN users u ON u.id = s.user_id \
         WHERE s.token = ?1 AND s.expires_at > ?2",
    )?;
    let mut rows = stmt.query_map(params![token, now], row_to_user)?;
    match rows.next() {
        Some(u) => Ok(Some(u?)),
        None => Ok(None),
    }
}

pub fn delete_session(pool: &Pool, token: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM sessions WHERE token = ?1", params![token])?;
    Ok(())
}

/// Drop every session and device token except `keep_token` and the device it
/// was minted from, so a rotated password evicts any stolen credential while
/// the caller stays signed in. An unknown `keep_token` revokes everything
/// (fail-closed).
pub fn revoke_other_sessions(pool: &Pool, user_id: &str, keep_token: &str) -> Result<()> {
    let conn = pool.get()?;
    let keep_device: Option<String> = conn
        .query_row(
            "SELECT access_token FROM sessions WHERE token = ?1",
            params![keep_token],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten();
    conn.execute(
        "DELETE FROM sessions WHERE user_id = ?1 AND token <> ?2",
        params![user_id, keep_token],
    )?;
    match keep_device {
        Some(dev) => conn.execute(
            "DELETE FROM access_tokens WHERE user_id = ?1 AND token <> ?2",
            params![user_id, dev],
        )?,
        None => conn.execute(
            "DELETE FROM access_tokens WHERE user_id = ?1",
            params![user_id],
        )?,
    };
    Ok(())
}

/// Drop every session and device token for the user. A completed credential
/// reset evicts everything, so a stolen credential dies with the old password.
pub fn revoke_all_sessions(pool: &Pool, user_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM sessions WHERE user_id = ?1", params![user_id])?;
    conn.execute(
        "DELETE FROM access_tokens WHERE user_id = ?1",
        params![user_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;
    use crate::accounts::{access_token_user, create_access_token, list_access_tokens};
    use crate::admin_users;

    #[test]
    fn sessions_resolve_and_expire() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        create_session(&p, "sess-tok", &u.id, FUTURE, Some("acc-tok")).unwrap();
        assert_eq!(session_user(&p, "sess-tok").unwrap().unwrap().id, u.id);
        assert_eq!(
            session_device_id(&p, "sess-tok").unwrap(),
            Some(kroma_primitives::short_hash("acc-tok"))
        );

        create_session(&p, "old-sess", &u.id, 1, None).unwrap();
        assert!(session_user(&p, "old-sess").unwrap().is_none());
        assert!(session_device_id(&p, "old-sess").unwrap().is_none());

        delete_session(&p, "sess-tok").unwrap();
        assert!(session_user(&p, "sess-tok").unwrap().is_none());
    }

    #[test]
    fn a_new_session_takes_the_users_expired_ones_with_it() {
        let p = pool();
        let user = mk_user(&p, "a@b.c", "alice");
        let other = mk_user(&p, "d@e.f", "dave");
        create_session(&p, "expired", &user.id, 1, Some("dev")).unwrap();
        create_session(&p, "live", &user.id, FUTURE, Some("dev")).unwrap();
        create_session(&p, "theirs", &other.id, 1, None).unwrap();

        create_session(&p, "renewed", &user.id, FUTURE, Some("dev")).unwrap();

        let tokens: Vec<String> = p
            .get()
            .unwrap()
            .prepare("SELECT token FROM sessions ORDER BY token")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(tokens, ["live", "renewed", "theirs"]);
    }

    #[test]
    fn renewing_stamps_the_account_and_relabels_the_device_beside_the_new_session() {
        let p = pool();
        let user = mk_user(&p, "a@b.c", "alice");
        create_access_token(&p, "dev", &user.id, FUTURE, true, &ua("Firefox")).unwrap();
        create_session(&p, "expired", &user.id, 1, Some("dev")).unwrap();

        renew_session(
            &p,
            "renewed",
            &user.id,
            FUTURE,
            "dev",
            &ua("Kroma/1.0 (iPhone 17 Pro; iOS 26.0)"),
        )
        .unwrap();

        assert_eq!(session_user(&p, "renewed").unwrap().unwrap().id, user.id);
        assert_eq!(
            session_device_id(&p, "renewed").unwrap(),
            Some(kroma_primitives::short_hash("dev"))
        );
        let device = &list_access_tokens(&p, &user.id).unwrap()[0];
        assert_eq!(
            device.user_agent.as_deref(),
            Some("Kroma/1.0 (iPhone 17 Pro; iOS 26.0)")
        );
        assert!(device.last_seen.is_some());
        let account = admin_users(&p)
            .unwrap()
            .into_iter()
            .find(|u| u.id == user.id)
            .unwrap();
        assert!(account.last_seen.is_some());
        let left: i64 = p
            .get()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE token = 'expired'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn revoking_other_sessions_keeps_the_caller_and_the_device_it_came_from() {
        let p = pool();
        let user = mk_user(&p, "a@b.c", "alice");

        create_access_token(&p, "dev-phone", &user.id, FUTURE, true, &ua("iPhone")).unwrap();
        create_access_token(&p, "dev-laptop", &user.id, FUTURE, true, &ua("Mac")).unwrap();
        create_session(&p, "sess-phone", &user.id, FUTURE, Some("dev-phone")).unwrap();
        create_session(&p, "sess-laptop", &user.id, FUTURE, Some("dev-laptop")).unwrap();

        revoke_other_sessions(&p, &user.id, "sess-phone").unwrap();

        assert!(session_user(&p, "sess-phone").unwrap().is_some());
        assert!(session_user(&p, "sess-laptop").unwrap().is_none());
        assert!(access_token_user(&p, "dev-phone").unwrap().is_some());
        assert!(access_token_user(&p, "dev-laptop").unwrap().is_none());
    }

    #[test]
    fn an_unknown_keep_token_revokes_every_device_credential() {
        let p = pool();
        let user = mk_user(&p, "a@b.c", "alice");
        create_access_token(&p, "dev-phone", &user.id, FUTURE, true, &ua("iPhone")).unwrap();
        create_session(&p, "sess-phone", &user.id, FUTURE, Some("dev-phone")).unwrap();

        revoke_other_sessions(&p, &user.id, "sess-gone").unwrap();

        assert!(session_user(&p, "sess-phone").unwrap().is_none());
        assert!(access_token_user(&p, "dev-phone").unwrap().is_none());
        assert!(list_access_tokens(&p, &user.id).unwrap().is_empty());
    }

    #[test]
    fn revoke_all_sessions_evicts_everything() {
        let p = pool();
        let user = mk_user(&p, "a@b.c", "alice");
        create_access_token(&p, "dev-phone", &user.id, FUTURE, true, &ua("iPhone")).unwrap();
        create_access_token(&p, "dev-laptop", &user.id, FUTURE, true, &ua("Mac")).unwrap();
        create_session(&p, "sess-phone", &user.id, FUTURE, Some("dev-phone")).unwrap();
        create_session(&p, "sess-laptop", &user.id, FUTURE, Some("dev-laptop")).unwrap();

        revoke_all_sessions(&p, &user.id).unwrap();

        assert!(session_user(&p, "sess-phone").unwrap().is_none());
        assert!(session_user(&p, "sess-laptop").unwrap().is_none());
        assert!(access_token_user(&p, "dev-phone").unwrap().is_none());
        assert!(access_token_user(&p, "dev-laptop").unwrap().is_none());
    }
}
