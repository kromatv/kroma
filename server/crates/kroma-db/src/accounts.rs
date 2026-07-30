//! Accounts: users, registration invites and sessions.

use super::*;

use rusqlite::OptionalExtension;

use kroma_domain::{Invite, PublicUser};

/// The id is random rather than derived from the email, so it isn't guessable.
/// The caller should pre-check the email to surface a clean 409; the `UNIQUE`
/// constraint is the hard guard.
pub fn create_user(
    pool: &Pool,
    email: &str,
    username: &str,
    password_hash: &str,
    permissions: &[Permission],
) -> Result<User> {
    let conn = pool.get()?;
    let permissions = permissions.to_vec();
    let perms_json = serde_json::to_string(&permissions).unwrap_or_else(|_| "[\"playback\"]".into());
    let id = kroma_primitives::short_hash(&format!("user|{email}|{}", kroma_primitives::random_token()));
    let created_at = now_or_blank();
    conn.execute(
        "INSERT INTO users (id,email,username,password_hash,avatar_url,permissions,created_at) \
         VALUES (?1,?2,?3,?4,NULL,?5,?6)",
        params![id, email, username, password_hash, perms_json, created_at],
    )?;
    Ok(User {
        id,
        email: email.to_string(),
        username: username.to_string(),
        avatar_url: None,
        language: None,
        permissions,
        created_at,
        has_pin: false,
        audio_language: None,
        subtitle_language: None,
    })
}

pub fn user_count(pool: &Pool) -> Result<i64> {
    let conn = pool.get()?;
    Ok(conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?)
}

fn row_to_invite(r: &Row) -> rusqlite::Result<Invite> {
    let used_at: Option<String> = r.get(5)?;
    Ok(Invite {
        token: r.get(0)?,
        permissions: parse_permissions(&r.get::<_, String>(1)?),
        created_by: r.get(2)?,
        created_at: r.get(3)?,
        expires_at: r.get(4)?,
        used: used_at.is_some(),
    })
}

pub fn create_invite(
    pool: &Pool,
    token: &str,
    permissions: &[Permission],
    created_by: &str,
    expires_at: i64,
) -> Result<()> {
    let conn = pool.get()?;
    let perms_json = serde_json::to_string(permissions).unwrap_or_else(|_| "[\"playback\"]".into());
    conn.execute(
        "INSERT INTO invites (token,permissions,created_by,created_at,expires_at,used_at) \
         VALUES (?1,?2,?3,?4,?5,NULL)",
        params![token, perms_json, created_by, now_or_blank(), expires_at],
    )?;
    Ok(())
}

/// Fetch one invite by token, whatever its state.
pub fn get_invite(pool: &Pool, token: &str) -> Result<Option<Invite>> {
    let conn = pool.get()?;
    let inv = conn
        .query_row(
            "SELECT token,permissions,created_by,created_at,expires_at,used_at FROM invites WHERE token = ?1",
            params![token],
            row_to_invite,
        )
        .optional()?;
    Ok(inv)
}

/// Atomically consume a valid (unused, unexpired) invite → its granted
/// permissions. `None` if the token is unknown / used / expired.
pub fn consume_invite(pool: &Pool, token: &str) -> Result<Option<Vec<Permission>>> {
    let conn = pool.get()?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    // `used_at IS NULL` is checked in the same statement that stamps it, and
    // `RETURNING` only yields to the caller that flipped the row, so two
    // concurrent registrations can't both win a single-use invite.
    let perms: Option<String> = conn
        .query_row(
            "UPDATE invites SET used_at = ?2 \
             WHERE token = ?1 AND used_at IS NULL AND expires_at > ?3 \
             RETURNING permissions",
            params![token, now_or_blank(), now],
            |r| r.get(0),
        )
        .optional()?;
    Ok(perms.map(|json| parse_permissions(&json)))
}

/// Pending invites (unused, unexpired), newest first.
pub fn list_invites(pool: &Pool) -> Result<Vec<Invite>> {
    let conn = pool.get()?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let mut stmt = conn.prepare(
        "SELECT token,permissions,created_by,created_at,expires_at,used_at FROM invites \
         WHERE used_at IS NULL AND expires_at > ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![now], row_to_invite)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn delete_invite(pool: &Pool, token: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM invites WHERE token = ?1", params![token])?;
    Ok(())
}

/// Matches the email case-insensitively; the second tuple field is the stored
/// password hash.
pub fn find_user_by_email(pool: &Pool, email: &str) -> Result<Option<(User, String)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,email,username,avatar_url,created_at,permissions,language,(pin_hash IS NOT NULL),audio_language,subtitle_language,password_hash FROM users WHERE email = ?1",
    )?;
    let mut rows = stmt.query_map(params![email], |r| {
        Ok((row_to_user(r)?, r.get::<_, String>(10)?))
    })?;
    match rows.next() {
        Some(v) => Ok(Some(v?)),
        None => Ok(None),
    }
}

/// `identifier` is either an email (case-insensitive) or a username, so the
/// profile picker — which only knows usernames — can log in. The second tuple
/// field is the stored password hash.
pub fn find_user_by_login(pool: &Pool, identifier: &str) -> Result<Option<(User, String)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,email,username,avatar_url,created_at,permissions,language,(pin_hash IS NOT NULL),audio_language,subtitle_language,password_hash FROM users \
         WHERE email = ?1 COLLATE NOCASE OR username = ?1 LIMIT 1",
    )?;
    let mut rows = stmt.query_map(params![identifier], |r| {
        Ok((row_to_user(r)?, r.get::<_, String>(10)?))
    })?;
    match rows.next() {
        Some(v) => Ok(Some(v?)),
        None => Ok(None),
    }
}

pub fn user_by_id(pool: &Pool, id: &str) -> Result<Option<User>> {
    let conn = pool.get()?;
    let user = conn
        .query_row(
            "SELECT id,email,username,avatar_url,created_at,permissions,language,(pin_hash IS NOT NULL),audio_language,subtitle_language FROM users WHERE id = ?1",
            params![id],
            row_to_user,
        )
        .optional()?;
    Ok(user)
}

pub fn list_users(pool: &Pool) -> Result<Vec<PublicUser>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,username,avatar_url,(pin_hash IS NOT NULL) FROM users ORDER BY created_at",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(PublicUser {
            id: r.get(0)?,
            username: r.get(1)?,
            avatar_url: r.get(2)?,
            has_pin: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Uploaded avatars live in the same `images` dir as the regenerable art cache,
/// so the cleanup job uses this to spare them — they can't be re-downloaded.
pub fn avatar_urls(pool: &Pool) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn set_user_avatar(pool: &Pool, user_id: &str, avatar_url: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET avatar_url = ?2 WHERE id = ?1",
        params![user_id, avatar_url],
    )?;
    Ok(())
}

pub fn set_user_language(pool: &Pool, user_id: &str, language: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET language = ?2 WHERE id = ?1",
        params![user_id, language],
    )?;
    Ok(())
}

pub fn set_user_audio_language(pool: &Pool, user_id: &str, language: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET audio_language = ?2 WHERE id = ?1",
        params![user_id, language],
    )?;
    Ok(())
}

/// The sentinel `"off"` is a stored value meaning "force subtitles off".
pub fn set_user_subtitle_language(pool: &Pool, user_id: &str, language: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET subtitle_language = ?2 WHERE id = ?1",
        params![user_id, language],
    )?;
    Ok(())
}

/// Checks the username column (case-sensitive, as username login resolves) AND
/// the email column (case-insensitive): a username equal to someone's email
/// would otherwise shadow that victim's email login through the
/// `email = ?1 OR username = ?1` in `find_user_by_login`. `exclude_id` skips the
/// caller's own row.
pub fn username_taken(pool: &Pool, username: &str, exclude_id: Option<&str>) -> Result<bool> {
    let conn = pool.get()?;
    let taken: i64 = match exclude_id {
        Some(id) => conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE (username = ?1 OR email = ?1 COLLATE NOCASE) AND id <> ?2)",
            params![username, id],
            |r| r.get(0),
        )?,
        None => conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE username = ?1 OR email = ?1 COLLATE NOCASE)",
            params![username],
            |r| r.get(0),
        )?,
    };
    Ok(taken != 0)
}

/// The caller must pre-check for a duplicate to surface a clean 409; the
/// `UNIQUE COLLATE NOCASE` constraint is the atomic backstop, so a `rusqlite`
/// error here is that collision.
pub fn set_user_email(pool: &Pool, user_id: &str, email: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET email = ?2 WHERE id = ?1",
        params![user_id, email],
    )?;
    Ok(())
}

pub fn user_password_hash(pool: &Pool, user_id: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let hash = conn
        .query_row("SELECT password_hash FROM users WHERE id = ?1", params![user_id], |r| {
            r.get::<_, String>(0)
        })
        .optional()?;
    Ok(hash)
}

pub fn set_user_password(pool: &Pool, user_id: &str, password_hash: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET password_hash = ?2 WHERE id = ?1",
        params![user_id, password_hash],
    )?;
    Ok(())
}

/// The stored PBKDF2 PIN hash, or `None` when no PIN is set.
pub fn user_pin_hash(pool: &Pool, user_id: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let hash = conn
        .query_row("SELECT pin_hash FROM users WHERE id = ?1", params![user_id], |r| {
            r.get::<_, Option<String>>(0)
        })
        .optional()?
        .flatten();
    Ok(hash)
}

pub fn set_user_pin(pool: &Pool, user_id: &str, pin_hash: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET pin_hash = ?2 WHERE id = ?1",
        params![user_id, pin_hash],
    )?;
    Ok(())
}

/// `access_token` records the device credential this session was minted from,
/// so the account's session list can flag the current device.
pub fn create_session(
    pool: &Pool,
    token: &str,
    user_id: &str,
    expires_at: i64,
    access_token: Option<&str>,
) -> Result<()> {
    let conn = pool.get()?;
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
        "SELECT u.id,u.email,u.username,u.avatar_url,u.created_at,u.permissions,u.language,(u.pin_hash IS NOT NULL),u.audio_language,u.subtitle_language \
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

/// `pin_verified` is true when the token was minted through a strong check
/// (password login / correct PIN), so the exchange can skip the PIN on
/// subsequent silent refreshes.
pub fn create_access_token(
    pool: &Pool,
    token: &str,
    user_id: &str,
    expires_at: i64,
    pin_verified: bool,
    user_agent: Option<&str>,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO access_tokens (token,user_id,created_at,expires_at,pin_verified,last_seen,user_agent) \
         VALUES (?1,?2,?3,?4,?5,?3,?6)",
        params![token, user_id, now_or_blank(), expires_at, pin_verified as i64, user_agent],
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

/// Revoke a device credential by its non-secret `short_hash(token)` id, also
/// deleting any live sessions minted from it so the device is signed out at
/// once. Scoped to `user_id`, so a caller can only revoke their own devices.
pub fn delete_access_token_by_id(pool: &Pool, user_id: &str, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    // Tokens are only reversible by hashing, hence the scan for a matching hash.
    let mut stmt =
        conn.prepare("SELECT token FROM access_tokens WHERE user_id = ?1")?;
    let tokens = stmt
        .query_map(params![user_id], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let Some(token) = tokens.into_iter().find(|t| kroma_primitives::short_hash(t) == id) else {
        return Ok(false);
    };
    conn.execute("DELETE FROM sessions WHERE access_token = ?1", params![token])?;
    conn.execute("DELETE FROM access_tokens WHERE token = ?1", params![token])?;
    Ok(true)
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
        None => conn.execute("DELETE FROM access_tokens WHERE user_id = ?1", params![user_id])?,
    };
    Ok(())
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

/// Stamp a device credential as seen now, re-labelling it with `user_agent`
/// when the caller sent one; an absent header keeps the stored label rather
/// than blanking it.
pub fn touch_access_token(pool: &Pool, token: &str, user_agent: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE access_tokens SET last_seen = ?2, user_agent = COALESCE(?3, user_agent) \
         WHERE token = ?1",
        params![token, now_or_blank(), user_agent],
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
    use kroma_domain::Permission;
    use std::sync::atomic::{AtomicU32, Ordering};

    static SEQ: AtomicU32 = AtomicU32::new(0);

    const FUTURE: i64 = 9_999_999_999;

    fn pool() -> Pool {
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("kroma-acct-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        crate::init(&path).unwrap()
    }

    fn mk_user(pool: &Pool, email: &str, username: &str) -> User {
        create_user(pool, email, username, "hash", &[Permission::Playback]).unwrap()
    }

    #[test]
    fn create_user_count_and_lookups() {
        let p = pool();
        assert_eq!(user_count(&p).unwrap(), 0);
        let u = create_user(&p, "Alice@Example.com", "alice", "pw-hash", &[Permission::Playback, Permission::UsersManage])
            .unwrap();
        assert_eq!(user_count(&p).unwrap(), 1);
        assert!(!u.id.is_empty());
        assert_eq!(u.permissions, vec![Permission::Playback, Permission::UsersManage]);
        assert!(!u.has_pin);

        let (found, hash) = find_user_by_email(&p, "alice@example.com").unwrap().unwrap();
        assert_eq!(found.id, u.id);
        assert_eq!(hash, "pw-hash");
        assert!(find_user_by_email(&p, "nobody@x.com").unwrap().is_none());

        assert_eq!(find_user_by_login(&p, "ALICE@example.com").unwrap().unwrap().0.id, u.id);
        assert_eq!(find_user_by_login(&p, "alice").unwrap().unwrap().0.id, u.id);
        assert!(find_user_by_login(&p, "ghost").unwrap().is_none());

        assert_eq!(user_by_id(&p, &u.id).unwrap().unwrap().username, "alice");
        assert!(user_by_id(&p, "missing").unwrap().is_none());
        let list = list_users(&p).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].username, "alice");
        assert!(!list[0].has_pin);
    }

    #[test]
    fn username_taken_checks_username_and_email() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        assert!(username_taken(&p, "alice", None).unwrap());
        assert!(username_taken(&p, "a@b.c", None).unwrap());
        assert!(!username_taken(&p, "bob", None).unwrap());
        assert!(!username_taken(&p, "alice", Some(&u.id)).unwrap());
        assert!(username_taken(&p, "alice", Some("other-id")).unwrap());
    }

    #[test]
    fn avatar_get_set_and_urls() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        assert!(avatar_urls(&p).unwrap().is_empty());
        set_user_avatar(&p, &u.id, Some("/api/images/av.webp")).unwrap();
        assert_eq!(avatar_urls(&p).unwrap(), vec!["/api/images/av.webp".to_string()]);
        assert_eq!(user_by_id(&p, &u.id).unwrap().unwrap().avatar_url.as_deref(), Some("/api/images/av.webp"));
        set_user_avatar(&p, &u.id, None).unwrap();
        assert!(avatar_urls(&p).unwrap().is_empty());
    }

    #[test]
    fn language_preferences_round_trip() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        set_user_language(&p, &u.id, Some("fr")).unwrap();
        set_user_audio_language(&p, &u.id, Some("ja")).unwrap();
        set_user_subtitle_language(&p, &u.id, Some("off")).unwrap();
        let got = user_by_id(&p, &u.id).unwrap().unwrap();
        assert_eq!(got.language.as_deref(), Some("fr"));
        assert_eq!(got.audio_language.as_deref(), Some("ja"));
        assert_eq!(got.subtitle_language.as_deref(), Some("off"));
        set_user_language(&p, &u.id, None).unwrap();
        assert!(user_by_id(&p, &u.id).unwrap().unwrap().language.is_none());
    }

    #[test]
    fn password_and_email_updates() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        assert_eq!(user_password_hash(&p, &u.id).unwrap().as_deref(), Some("hash"));
        assert!(user_password_hash(&p, "missing").unwrap().is_none());
        set_user_password(&p, &u.id, "new-hash").unwrap();
        assert_eq!(user_password_hash(&p, &u.id).unwrap().as_deref(), Some("new-hash"));

        set_user_email(&p, &u.id, "new@b.c").unwrap();
        assert!(find_user_by_email(&p, "new@b.c").unwrap().is_some());
        assert!(find_user_by_email(&p, "a@b.c").unwrap().is_none());
    }

    #[test]
    fn pin_hash_set_clear_and_has_pin_flag() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        assert!(user_pin_hash(&p, &u.id).unwrap().is_none());
        assert!(!user_by_id(&p, &u.id).unwrap().unwrap().has_pin);

        set_user_pin(&p, &u.id, Some("pin-hash")).unwrap();
        assert_eq!(user_pin_hash(&p, &u.id).unwrap().as_deref(), Some("pin-hash"));
        assert!(user_by_id(&p, &u.id).unwrap().unwrap().has_pin);
        assert!(list_users(&p).unwrap()[0].has_pin);

        set_user_pin(&p, &u.id, None).unwrap();
        assert!(user_pin_hash(&p, &u.id).unwrap().is_none());
        assert!(!user_by_id(&p, &u.id).unwrap().unwrap().has_pin);
    }

    #[test]
    fn invites_create_list_consume_and_delete() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        create_invite(&p, "inv1", &[Permission::Playback, Permission::RequestsCreate], &owner.id, FUTURE).unwrap();

        let got = get_invite(&p, "inv1").unwrap().unwrap();
        assert_eq!(got.token, "inv1");
        assert_eq!(got.permissions, vec![Permission::Playback, Permission::RequestsCreate]);
        assert!(!got.used);
        assert_eq!(list_invites(&p).unwrap().len(), 1);

        let perms = consume_invite(&p, "inv1").unwrap().unwrap();
        assert_eq!(perms, vec![Permission::Playback, Permission::RequestsCreate]);
        assert!(get_invite(&p, "inv1").unwrap().unwrap().used);
        assert!(consume_invite(&p, "inv1").unwrap().is_none());
        assert!(list_invites(&p).unwrap().is_empty());

        create_invite(&p, "old", &[Permission::Playback], &owner.id, 1).unwrap();
        assert!(consume_invite(&p, "old").unwrap().is_none());
        assert!(list_invites(&p).unwrap().is_empty());
        assert!(consume_invite(&p, "unknown").unwrap().is_none());

        create_invite(&p, "inv2", &[Permission::Playback], &owner.id, FUTURE).unwrap();
        delete_invite(&p, "inv2").unwrap();
        assert!(get_invite(&p, "inv2").unwrap().is_none());
    }

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
    fn access_tokens_lifecycle_and_pin_verified() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        create_access_token(&p, "at1", &u.id, FUTURE, false, Some("Firefox")).unwrap();

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

        touch_access_token(&p, "at1", Some("Kroma/1.0 (iPhone 17 Pro; iOS 26.0)")).unwrap();
        touch_access_token(&p, "at1", None).unwrap();
        let rows = list_access_tokens(&p, &u.id).unwrap();
        assert_eq!(rows[0].user_agent.as_deref(), Some("Kroma/1.0 (iPhone 17 Pro; iOS 26.0)"));
        assert!(rows[0].last_seen.is_some());

        create_access_token(&p, "old-at", &u.id, 1, false, None).unwrap();
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
        create_access_token(&p, "at-alice", &alice.id, FUTURE, true, None).unwrap();
        create_session(&p, "sess-alice", &alice.id, FUTURE, Some("at-alice")).unwrap();

        let id = kroma_primitives::short_hash("at-alice");
        assert!(!delete_access_token_by_id(&p, &bob.id, &id).unwrap());
        assert!(delete_access_token_by_id(&p, &alice.id, &id).unwrap());
        assert!(access_token_user(&p, "at-alice").unwrap().is_none());
        assert!(session_user(&p, "sess-alice").unwrap().is_none());
        assert!(!delete_access_token_by_id(&p, &alice.id, "deadbeef").unwrap());
    }
}
