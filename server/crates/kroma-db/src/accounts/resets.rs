//! Credential resets: the token + code an admin mints for a locked-out user.

use anyhow::Result;
use rusqlite::{params, OptionalExtension, Row};

use crate::{now_or_blank, Pool};

pub const MAX_RESET_ATTEMPTS: i64 = 5;

pub struct CredentialReset {
    pub token: String,
    pub user_id: String,
    pub code_hash: String,
    pub attempts: i64,
    pub created_by: Option<String>,
    pub created_at: String,
    pub expires_at: i64,
    pub used_at: Option<String>,
}

fn row_to_reset(r: &Row) -> rusqlite::Result<CredentialReset> {
    Ok(CredentialReset {
        token: r.get(0)?,
        user_id: r.get(1)?,
        code_hash: r.get(2)?,
        attempts: r.get(3)?,
        created_by: r.get(4)?,
        created_at: r.get(5)?,
        expires_at: r.get(6)?,
        used_at: r.get(7)?,
    })
}

/// Mint a reset for `user_id`, replacing any unused one. Returns the token.
/// Minting also answers any reset the user asked for from the sign-in screen.
pub fn create_reset(
    pool: &Pool,
    token: &str,
    user_id: &str,
    code_hash: &str,
    created_by: &str,
    expires_at: i64,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM credential_resets WHERE user_id = ?1 AND used_at IS NULL",
        params![user_id],
    )?;
    conn.execute(
        "INSERT INTO credential_resets (token,user_id,code_hash,attempts,created_by,created_at,expires_at,used_at) \
         VALUES (?1,?2,?3,0,?4,?5,?6,NULL)",
        params![token, user_id, code_hash, created_by, now_or_blank(), expires_at],
    )?;
    conn.execute(
        "DELETE FROM reset_requests WHERE user_id = ?1",
        params![user_id],
    )?;
    Ok(())
}

/// Record (or refresh) that `user_id` asked for a reset from the sign-in
/// screen. One open request per account: asking again just moves the date.
pub fn request_reset(pool: &Pool, user_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO reset_requests (user_id,created_at) VALUES (?1,?2) \
         ON CONFLICT(user_id) DO UPDATE SET created_at = excluded.created_at",
        params![user_id, now_or_blank()],
    )?;
    Ok(())
}

/// Fetch one reset by token, whatever its state.
pub fn get_reset(pool: &Pool, token: &str) -> Result<Option<CredentialReset>> {
    let conn = pool.get()?;
    let reset = conn
        .query_row(
            "SELECT token,user_id,code_hash,attempts,created_by,created_at,expires_at,used_at \
             FROM credential_resets WHERE token = ?1",
            params![token],
            row_to_reset,
        )
        .optional()?;
    Ok(reset)
}

/// Atomically consume a valid (unused, unexpired, unlocked) reset → its user id.
/// `None` if the token is unknown / used / expired / locked.
pub fn consume_reset(pool: &Pool, token: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let user_id: Option<String> = conn
        .query_row(
            "UPDATE credential_resets SET used_at = ?2 \
             WHERE token = ?1 AND used_at IS NULL AND expires_at > ?3 AND attempts < ?4 \
             RETURNING user_id",
            params![token, now_or_blank(), now, MAX_RESET_ATTEMPTS],
            |r| r.get(0),
        )
        .optional()?;
    Ok(user_id)
}

/// Record a wrong code. Returns the new attempt count.
pub fn bump_reset_attempts(pool: &Pool, token: &str) -> Result<i64> {
    let conn = pool.get()?;
    let attempts: i64 = conn.query_row(
        "UPDATE credential_resets SET attempts = attempts + 1 WHERE token = ?1 RETURNING attempts",
        params![token],
        |r| r.get(0),
    )?;
    Ok(attempts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;

    #[test]
    fn resets_create_get_consume_and_lock() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        create_reset(&p, "tok1", &user.id, "code-hash", &owner.id, FUTURE).unwrap();

        let got = get_reset(&p, "tok1").unwrap().unwrap();
        assert_eq!(got.token, "tok1");
        assert_eq!(got.user_id, user.id);
        assert_eq!(got.attempts, 0);
        assert!(got.used_at.is_none());

        let uid = consume_reset(&p, "tok1").unwrap().unwrap();
        assert_eq!(uid, user.id);
        assert!(get_reset(&p, "tok1").unwrap().unwrap().used_at.is_some());
        assert!(consume_reset(&p, "tok1").unwrap().is_none());
    }

    #[test]
    fn a_new_reset_replaces_the_unused_one() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        create_reset(&p, "tok1", &user.id, "h1", &owner.id, FUTURE).unwrap();
        create_reset(&p, "tok2", &user.id, "h2", &owner.id, FUTURE).unwrap();

        assert!(get_reset(&p, "tok1").unwrap().is_none());
        assert!(get_reset(&p, "tok2").unwrap().is_some());
    }

    #[test]
    fn expired_and_locked_resets_cannot_be_consumed() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        create_reset(&p, "old", &user.id, "h", &owner.id, 1).unwrap();
        assert!(consume_reset(&p, "old").unwrap().is_none());

        create_reset(&p, "locked", &user.id, "h", &owner.id, FUTURE).unwrap();
        for _ in 0..MAX_RESET_ATTEMPTS {
            bump_reset_attempts(&p, "locked").unwrap();
        }
        assert!(consume_reset(&p, "locked").unwrap().is_none());
    }

    #[test]
    fn bumping_attempts_counts_up() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        create_reset(&p, "tok", &user.id, "h", &owner.id, FUTURE).unwrap();

        assert_eq!(bump_reset_attempts(&p, "tok").unwrap(), 1);
        assert_eq!(bump_reset_attempts(&p, "tok").unwrap(), 2);
        assert_eq!(get_reset(&p, "tok").unwrap().unwrap().attempts, 2);
    }

    #[test]
    fn a_reset_request_marks_the_member_until_a_reset_is_minted() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        assert!(!requested(&p, &user.id));

        request_reset(&p, &user.id).unwrap();
        assert!(requested(&p, &user.id));
        request_reset(&p, &user.id).unwrap();
        assert!(requested(&p, &user.id));

        create_reset(&p, "tok", &user.id, "h", &owner.id, FUTURE).unwrap();
        assert!(!requested(&p, &user.id));
    }

    fn requested(p: &Pool, user_id: &str) -> bool {
        crate::admin_users(p)
            .unwrap()
            .into_iter()
            .find(|u| u.id == user_id)
            .unwrap()
            .reset_requested
    }
}
