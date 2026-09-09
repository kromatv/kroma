//! The long-lived device credential a session is minted from.

use anyhow::Result;
use rusqlite::params;

use kroma_domain::User;

use crate::rows::row_to_user;
use crate::{now_or_blank, Pool};

/// What the calling device said about itself on the request that minted or
/// refreshed a credential: the raw `User-Agent`, and the language tag it asked
/// for. Both are labels, never identity.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeviceHints {
    pub user_agent: Option<String>,
    pub language: Option<String>,
}

/// `pin_verified` is true when the token was minted through a strong check
/// (password login / correct PIN), so the exchange can skip the PIN on
/// subsequent silent refreshes.
pub fn create_access_token(
    pool: &Pool,
    token: &str,
    user_id: &str,
    expires_at: i64,
    pin_verified: bool,
    hints: &DeviceHints,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO access_tokens (token,user_id,created_at,expires_at,pin_verified,last_seen,user_agent,language) \
         VALUES (?1,?2,?3,?4,?5,?3,?6,?7)",
        params![
            token,
            user_id,
            now_or_blank(),
            expires_at,
            pin_verified as i64,
            hints.user_agent,
            hints.language
        ],
    )?;
    Ok(())
}

pub struct AccessTokenRow {
    pub id: String,
    pub user_agent: Option<String>,
    pub created_at: String,
    pub last_seen: Option<String>,
}

/// A user's live (non-expired) device credentials, newest first.
pub fn list_access_tokens(pool: &Pool, user_id: &str) -> Result<Vec<AccessTokenRow>> {
    let conn = pool.get()?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let mut stmt = conn.prepare(
        "SELECT token,created_at,last_seen,user_agent FROM access_tokens \
         WHERE user_id = ?1 AND expires_at > ?2 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![user_id, now], |r| {
        let token: String = r.get(0)?;
        Ok(AccessTokenRow {
            id: kroma_primitives::short_hash(&token),
            created_at: r.get(1)?,
            last_seen: r.get(2)?,
            user_agent: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// What every live device credential seen at or after `since` (an ISO-8601
/// instant, which sorts lexicographically) last told us about itself. One row
/// per device, so the caller counts devices rather than requests.
pub fn devices_seen_since(pool: &Pool, since: &str) -> Result<Vec<DeviceHints>> {
    let conn = pool.get()?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let mut stmt = conn.prepare(
        "SELECT user_agent,language FROM access_tokens \
         WHERE expires_at > ?1 AND last_seen IS NOT NULL AND last_seen >= ?2",
    )?;
    let rows = stmt.query_map(params![now, since], |r| {
        Ok(DeviceHints {
            user_agent: r.get(0)?,
            language: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Revoke a device credential by its non-secret `short_hash(token)` id, also
/// deleting any live sessions minted from it so the device is signed out at
/// once. Scoped to `user_id`, so a caller can only revoke their own devices.
pub fn delete_access_token_by_id(pool: &Pool, user_id: &str, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    // Tokens are only reversible by hashing, hence the scan for a matching hash.
    let mut stmt = conn.prepare("SELECT token FROM access_tokens WHERE user_id = ?1")?;
    let tokens = stmt
        .query_map(params![user_id], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let Some(token) = tokens
        .into_iter()
        .find(|t| kroma_primitives::short_hash(t) == id)
    else {
        return Ok(false);
    };
    conn.execute(
        "DELETE FROM sessions WHERE access_token = ?1",
        params![token],
    )?;
    conn.execute("DELETE FROM access_tokens WHERE token = ?1", params![token])?;
    Ok(true)
}

/// The user behind a non-expired access token, plus its `pin_verified` flag.
pub fn access_token_user(pool: &Pool, token: &str) -> Result<Option<(User, bool)>> {
    let conn = pool.get()?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let mut stmt = conn.prepare(
        "SELECT u.id,u.email,u.username,u.avatar_url,u.created_at,u.permissions,u.language,(u.pin_hash IS NOT NULL),u.audio_language,u.subtitle_language,a.pin_verified \
         FROM access_tokens a JOIN users u ON u.id = a.user_id \
         WHERE a.token = ?1 AND a.expires_at > ?2",
    )?;
    let mut rows = stmt.query_map(params![token, now], |r| {
        Ok((row_to_user(r)?, r.get::<_, i64>(10)? != 0))
    })?;
    match rows.next() {
        Some(v) => Ok(Some(v?)),
        None => Ok(None),
    }
}

/// Stamp a device credential as seen now, re-labelling it with whatever the
/// caller sent this time; an absent header keeps the stored label rather than
/// blanking it.
pub fn touch_access_token(pool: &Pool, token: &str, hints: &DeviceHints) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE access_tokens SET last_seen = ?2, user_agent = COALESCE(?3, user_agent), \
         language = COALESCE(?4, language) WHERE token = ?1",
        params![token, now_or_blank(), hints.user_agent, hints.language],
    )?;
    Ok(())
}

pub fn set_access_pin_verified(pool: &Pool, token: &str, verified: bool) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE access_tokens SET pin_verified = ?2 WHERE token = ?1",
        params![token, verified as i64],
    )?;
    Ok(())
}

/// Re-lock every device: called when the PIN is set, rotated or cleared, so all
/// of them must re-confirm the new state.
pub fn reset_access_pin_verified(pool: &Pool, user_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE access_tokens SET pin_verified = 0 WHERE user_id = ?1",
        params![user_id],
    )?;
    Ok(())
}

pub fn delete_access_token(pool: &Pool, token: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM access_tokens WHERE token = ?1", params![token])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;
    use crate::accounts::{create_session, session_user};

    #[test]
    fn only_live_devices_touched_since_the_cutoff_are_counted() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");

        create_access_token(
            &p,
            "fresh",
            &u.id,
            FUTURE,
            false,
            &spoken("Kroma/1.0", "de-de"),
        )
        .unwrap();
        create_access_token(&p, "never-seen", &u.id, FUTURE, false, &ua("Chrome")).unwrap();
        create_access_token(&p, "expired", &u.id, 1, false, &ua("Tizen")).unwrap();
        p.get()
            .unwrap()
            .execute(
                "UPDATE access_tokens SET last_seen = NULL WHERE token = 'never-seen'",
                [],
            )
            .unwrap();

        let seen = devices_seen_since(&p, "1970-01-01T00:00:00Z").unwrap();

        assert_eq!(seen, vec![spoken("Kroma/1.0", "de-de")]);
        assert!(devices_seen_since(&p, "2999-01-01T00:00:00Z")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn access_tokens_lifecycle_and_pin_verified() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        create_access_token(&p, "at1", &u.id, FUTURE, false, &ua("Firefox")).unwrap();

        let (user, pin_verified) = access_token_user(&p, "at1").unwrap().unwrap();
        assert_eq!(user.id, u.id);
        assert!(!pin_verified);

        set_access_pin_verified(&p, "at1", true).unwrap();
        assert!(access_token_user(&p, "at1").unwrap().unwrap().1);
        reset_access_pin_verified(&p, &u.id).unwrap();
        assert!(!access_token_user(&p, "at1").unwrap().unwrap().1);

        let rows = list_access_tokens(&p, &u.id).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, kroma_primitives::short_hash("at1"));
        assert_eq!(rows[0].user_agent.as_deref(), Some("Firefox"));

        touch_access_token(&p, "at1", &ua("Kroma/1.0 (iPhone 17 Pro; iOS 26.0)")).unwrap();
        touch_access_token(&p, "at1", &DeviceHints::default()).unwrap();
        let rows = list_access_tokens(&p, &u.id).unwrap();
        assert_eq!(
            rows[0].user_agent.as_deref(),
            Some("Kroma/1.0 (iPhone 17 Pro; iOS 26.0)")
        );
        assert!(rows[0].last_seen.is_some());

        create_access_token(&p, "old-at", &u.id, 1, false, &DeviceHints::default()).unwrap();
        assert!(access_token_user(&p, "old-at").unwrap().is_none());
        assert_eq!(list_access_tokens(&p, &u.id).unwrap().len(), 1);

        delete_access_token(&p, "at1").unwrap();
        assert!(access_token_user(&p, "at1").unwrap().is_none());
    }

    #[test]
    fn delete_access_token_by_id_scopes_to_owner_and_drops_sessions() {
        let p = pool();
        let alice = mk_user(&p, "a@b.c", "alice");
        let bob = mk_user(&p, "b@b.c", "bob");
        create_access_token(
            &p,
            "at-alice",
            &alice.id,
            FUTURE,
            true,
            &DeviceHints::default(),
        )
        .unwrap();
        create_session(&p, "sess-alice", &alice.id, FUTURE, Some("at-alice")).unwrap();

        let id = kroma_primitives::short_hash("at-alice");
        assert!(!delete_access_token_by_id(&p, &bob.id, &id).unwrap());
        assert!(delete_access_token_by_id(&p, &alice.id, &id).unwrap());
        assert!(access_token_user(&p, "at-alice").unwrap().is_none());
        assert!(session_user(&p, "sess-alice").unwrap().is_none());
        assert!(!delete_access_token_by_id(&p, &alice.id, "deadbeef").unwrap());
    }
}
