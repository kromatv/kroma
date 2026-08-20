//! The secrets on a user row: the password hash and the PIN hash.

use anyhow::Result;
use rusqlite::{params, OptionalExtension};

use crate::Pool;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;
    use crate::accounts::{find_user_by_email, list_users, set_user_email, user_by_id};

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
}
