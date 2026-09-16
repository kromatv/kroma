//! Email verifications: the single-use link an admin mints so an address proves
//! its mailbox. Unlike a credential reset there is no code: reaching the mailbox
//! is itself the proof, so the link alone suffices. The row pins the address it
//! was minted for, and confirming verifies nothing once the account's address no
//! longer matches it (ADMIN-87).

use anyhow::Result;
use rusqlite::{params, OptionalExtension, Row};

use crate::{now_or_blank, Pool};

pub struct EmailVerification {
    pub token: String,
    pub user_id: String,
    pub email: String,
    pub created_by: Option<String>,
    pub created_at: String,
    pub expires_at: i64,
    pub used_at: Option<String>,
}

fn row_to_verification(r: &Row) -> rusqlite::Result<EmailVerification> {
    Ok(EmailVerification {
        token: r.get(0)?,
        user_id: r.get(1)?,
        email: r.get(2)?,
        created_by: r.get(3)?,
        created_at: r.get(4)?,
        expires_at: r.get(5)?,
        used_at: r.get(6)?,
    })
}

/// Mint a verification for `user_id`'s current address, replacing any unused one.
pub fn create_verification(
    pool: &Pool,
    token: &str,
    user_id: &str,
    email: &str,
    created_by: &str,
    expires_at: i64,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM email_verifications WHERE user_id = ?1 AND used_at IS NULL",
        params![user_id],
    )?;
    conn.execute(
        "INSERT INTO email_verifications (token,user_id,email,created_by,created_at,expires_at,used_at) \
         VALUES (?1,?2,?3,?4,?5,?6,NULL)",
        params![token, user_id, email, created_by, now_or_blank(), expires_at],
    )?;
    Ok(())
}

/// Fetch one verification by token, whatever its state.
pub fn get_verification(pool: &Pool, token: &str) -> Result<Option<EmailVerification>> {
    let conn = pool.get()?;
    let v = conn
        .query_row(
            "SELECT token,user_id,email,created_by,created_at,expires_at,used_at \
             FROM email_verifications WHERE token = ?1",
            params![token],
            row_to_verification,
        )
        .optional()?;
    Ok(v)
}

/// Confirm a verification: mark the address verified and the token used, only
/// while the token is unused, unexpired and the account's address is still the
/// one the link was minted for. A relay `grant` that rode in with the click is
/// kept for that address, and only when the link held. Returns the verified
/// user id, or `None`.
pub fn confirm_verification(
    pool: &Pool,
    token: &str,
    grant: Option<&str>,
) -> Result<Option<String>> {
    let conn = pool.get()?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let confirmed: Option<(String, String)> = conn
        .query_row(
            "UPDATE users SET email_verified_at = ?2 \
             WHERE id = (SELECT user_id FROM email_verifications \
                         WHERE token = ?1 AND used_at IS NULL AND expires_at > ?2) \
               AND email = (SELECT email FROM email_verifications WHERE token = ?1) \
             RETURNING id, email",
            params![token, now],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let Some((user_id, email)) = confirmed else {
        return Ok(None);
    };
    conn.execute(
        "UPDATE email_verifications SET used_at = ?2 WHERE token = ?1",
        params![token, now_or_blank()],
    )?;
    if let Some(grant) = grant {
        conn.execute(
            "INSERT INTO mail_grants (user_id,email,grant,created_at,last_ok_at) \
             VALUES (?1,?2,?3,?4,NULL) \
             ON CONFLICT(user_id) DO UPDATE SET \
               email = excluded.email, grant = excluded.grant, \
               created_at = excluded.created_at, last_ok_at = NULL",
            params![user_id, email, grant, now_or_blank()],
        )?;
    }
    Ok(Some(user_id))
}

/// Set or clear the address's proof of ownership directly.
pub fn set_email_verified(pool: &Pool, user_id: &str, verified: bool) -> Result<()> {
    let conn = pool.get()?;
    let at = verified.then(now_or_blank);
    conn.execute(
        "UPDATE users SET email_verified_at = ?2 WHERE id = ?1",
        params![user_id, at],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;

    #[test]
    fn verifications_create_get_and_confirm() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        create_verification(&p, "tok1", &user.id, "u@b.c", &owner.id, FUTURE).unwrap();

        let got = get_verification(&p, "tok1").unwrap().unwrap();
        assert_eq!(got.user_id, user.id);
        assert_eq!(got.email, "u@b.c");
        assert!(got.used_at.is_none());

        let uid = confirm_verification(&p, "tok1", None).unwrap().unwrap();
        assert_eq!(uid, user.id);
        assert!(get_verification(&p, "tok1").unwrap().unwrap().used_at.is_some());
        assert!(confirm_verification(&p, "tok1", None).unwrap().is_none());
    }

    #[test]
    fn a_new_verification_replaces_the_unused_one() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        create_verification(&p, "tok1", &user.id, "u@b.c", &owner.id, FUTURE).unwrap();
        create_verification(&p, "tok2", &user.id, "u@b.c", &owner.id, FUTURE).unwrap();

        assert!(get_verification(&p, "tok1").unwrap().is_none());
        assert!(get_verification(&p, "tok2").unwrap().is_some());
    }

    #[test]
    fn an_expired_verification_cannot_be_confirmed() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        create_verification(&p, "old", &user.id, "u@b.c", &owner.id, 1).unwrap();

        assert!(confirm_verification(&p, "old", None).unwrap().is_none());
    }

    #[test]
    fn a_changed_address_verifies_nothing() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        create_verification(&p, "tok", &user.id, "u@b.c", &owner.id, FUTURE).unwrap();
        crate::accounts::set_user_email(&p, &user.id, "new@b.c").unwrap();

        assert!(confirm_verification(&p, "tok", None).unwrap().is_none());
        assert!(get_verification(&p, "tok").unwrap().unwrap().used_at.is_none());
    }

    #[test]
    fn a_grant_that_rides_in_with_the_click_is_kept_for_that_address() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        create_verification(&p, "tok", &user.id, "u@b.c", &owner.id, FUTURE).unwrap();

        confirm_verification(&p, "tok", Some("v1.sealed")).unwrap().unwrap();

        let grant = crate::accounts::mail_grant(&p, &user.id).unwrap().unwrap();
        assert_eq!(grant.email, "u@b.c");
        assert_eq!(grant.grant, "v1.sealed");
    }

    #[test]
    fn a_grant_offered_on_a_link_that_does_not_hold_is_dropped() {
        let p = pool();
        let owner = mk_user(&p, "o@b.c", "owner");
        let user = mk_user(&p, "u@b.c", "user");
        create_verification(&p, "old", &user.id, "u@b.c", &owner.id, 1).unwrap();

        assert!(confirm_verification(&p, "old", Some("v1.sealed")).unwrap().is_none());
        assert!(crate::accounts::mail_grant(&p, &user.id).unwrap().is_none());
    }

    #[test]
    fn changing_the_address_clears_the_verified_state() {
        let p = pool();
        let user = mk_user(&p, "u@b.c", "user");
        set_email_verified(&p, &user.id, true).unwrap();
        assert!(email_verified(&p, &user.id));

        crate::accounts::set_user_email(&p, &user.id, "new@b.c").unwrap();
        assert!(!email_verified(&p, &user.id));
    }

    fn email_verified(p: &Pool, id: &str) -> bool {
        p.get()
            .unwrap()
            .query_row(
                "SELECT email_verified_at IS NOT NULL FROM users WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap()
    }
}
