//! Storage for WebAuthn credentials. The ceremonies live in `api::passkeys`,
//! which serializes the webauthn-rs `Passkey` into the `credential` column.

use super::*;

use rusqlite::OptionalExtension;

pub struct PasskeyRow {
    // Credential id, base64url.
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub last_used: Option<String>,
}

/// Returns the `created_at` timestamp written.
pub fn insert_passkey(
    pool: &Pool,
    id: &str,
    user_id: &str,
    name: &str,
    credential: &str,
) -> Result<String> {
    let conn = pool.get()?;
    let created_at = now_or_blank();
    conn.execute(
        "INSERT INTO passkeys (id,user_id,name,credential,created_at,last_used) \
         VALUES (?1,?2,?3,?4,?5,NULL)",
        params![id, user_id, name, credential, created_at],
    )?;
    Ok(created_at)
}

/// Newest first.
pub fn list_passkeys(pool: &Pool, user_id: &str) -> Result<Vec<PasskeyRow>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,name,created_at,last_used FROM passkeys \
         WHERE user_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![user_id], |r| {
        Ok(PasskeyRow {
            id: r.get(0)?,
            name: r.get(1)?,
            created_at: r.get(2)?,
            last_used: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// The serialized `Passkey` JSON blobs for a user.
pub fn passkey_credentials(pool: &Pool, user_id: &str) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT credential FROM passkeys WHERE user_id = ?1")?;
    let rows = stmt.query_map(params![user_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Distinct account ids that have at least one passkey; discoverable sign-in
/// matches the assertion's user handle against these.
pub fn passkey_user_ids(pool: &Pool) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT DISTINCT user_id FROM passkeys")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Marks a credential used, replacing the stored blob when the authenticator's
/// signature counter advanced (webauthn-rs `needs_update`).
pub fn touch_passkey(pool: &Pool, id: &str, credential: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    match credential {
        Some(cred) => conn.execute(
            "UPDATE passkeys SET last_used = ?2, credential = ?3 WHERE id = ?1",
            params![id, now_or_blank(), cred],
        )?,
        None => conn.execute(
            "UPDATE passkeys SET last_used = ?2 WHERE id = ?1",
            params![id, now_or_blank()],
        )?,
    };
    Ok(())
}

/// Scoped to `user_id` so a caller can only delete their own.
pub fn delete_passkey(pool: &Pool, user_id: &str, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let n = conn.execute(
        "DELETE FROM passkeys WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
    )?;
    Ok(n > 0)
}

#[allow(dead_code)]
pub fn passkey_exists(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let found: Option<i64> = conn
        .query_row("SELECT 1 FROM passkeys WHERE id = ?1", params![id], |r| {
            r.get(0)
        })
        .optional()?;
    Ok(found.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;
    use kroma_domain::Permission;

    fn pool_with_users() -> (TempPool, String, String) {
        let pool = crate::testing::temp_pool("pk");
        let a = crate::create_user(&pool, "a@b.c", "alice", "h", &[Permission::Playback]).unwrap();
        let b = crate::create_user(&pool, "b@b.c", "bob", "h", &[Permission::Playback]).unwrap();
        (pool, a.id, b.id)
    }

    #[test]
    fn insert_list_credentials_and_ids() {
        let (p, alice, bob) = pool_with_users();
        insert_passkey(&p, "cred-a1", &alice, "Alice iPhone", "{\"blob\":1}").unwrap();
        insert_passkey(&p, "cred-a2", &alice, "Alice Yubikey", "{\"blob\":2}").unwrap();
        insert_passkey(&p, "cred-b1", &bob, "Bob laptop", "{\"blob\":3}").unwrap();

        let alice_keys = list_passkeys(&p, &alice).unwrap();
        assert_eq!(alice_keys.len(), 2);
        assert!(alice_keys.iter().all(|k| k.last_used.is_none()));

        assert_eq!(passkey_credentials(&p, &alice).unwrap().len(), 2);
        let mut ids = passkey_user_ids(&p).unwrap();
        ids.sort();
        let mut want = vec![alice.clone(), bob.clone()];
        want.sort();
        assert_eq!(ids, want);
        assert!(passkey_exists(&p, "cred-a1").unwrap());
        assert!(!passkey_exists(&p, "nope").unwrap());
    }

    #[test]
    fn touch_updates_and_delete_is_scoped() {
        let (p, alice, bob) = pool_with_users();
        insert_passkey(&p, "cred-a1", &alice, "Alice iPhone", "{\"blob\":1}").unwrap();

        touch_passkey(&p, "cred-a1", Some("{\"blob\":9}")).unwrap();
        assert!(list_passkeys(&p, &alice).unwrap()[0].last_used.is_some());
        assert_eq!(
            passkey_credentials(&p, &alice).unwrap(),
            vec!["{\"blob\":9}".to_string()]
        );
        touch_passkey(&p, "cred-a1", None).unwrap();
        assert_eq!(
            passkey_credentials(&p, &alice).unwrap(),
            vec!["{\"blob\":9}".to_string()]
        );

        assert!(!delete_passkey(&p, &bob, "cred-a1").unwrap());
        assert!(delete_passkey(&p, &alice, "cred-a1").unwrap());
        assert!(list_passkeys(&p, &alice).unwrap().is_empty());
        assert!(passkey_user_ids(&p).unwrap().is_empty());
    }
}
