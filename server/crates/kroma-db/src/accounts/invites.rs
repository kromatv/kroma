//! Invites: the token a new account is created against.

use anyhow::Result;
use rusqlite::{params, OptionalExtension, Row};

use kroma_domain::{Invite, Permission};

use crate::rows::parse_permissions;
use crate::{now_or_blank, Pool};

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;

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
}
