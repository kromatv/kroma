//! The mail relay's permission to write to one account's address. The server
//! cannot read it and never chose it: the mailbox minted it by clicking the
//! relay's consent link, and the relay renews it on every message it carries.

use anyhow::Result;
use rusqlite::{params, OptionalExtension};

use crate::{now_or_blank, Pool};

pub struct MailGrant {
    pub email: String,
    pub grant: String,
}

/// Store the grant a mailbox just minted, replacing any older one.
pub fn set_mail_grant(pool: &Pool, user_id: &str, email: &str, grant: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO mail_grants (user_id,email,grant,created_at,last_ok_at) \
         VALUES (?1,?2,?3,?4,NULL) \
         ON CONFLICT(user_id) DO UPDATE SET \
           email = excluded.email, grant = excluded.grant, \
           created_at = excluded.created_at, last_ok_at = NULL",
        params![user_id, email, grant, now_or_blank()],
    )?;
    Ok(())
}

/// The account's grant, only while it still names the account's current address.
pub fn mail_grant(pool: &Pool, user_id: &str) -> Result<Option<MailGrant>> {
    let conn = pool.get()?;
    let row = conn
        .query_row(
            "SELECT g.email, g.grant FROM mail_grants g \
             JOIN users u ON u.id = g.user_id \
             WHERE g.user_id = ?1 AND u.email = g.email COLLATE NOCASE",
            params![user_id],
            |r| {
                Ok(MailGrant {
                    email: r.get(0)?,
                    grant: r.get(1)?,
                })
            },
        )
        .optional()?;
    Ok(row)
}

/// Keep the fresher grant the relay handed back with a delivery.
pub fn renew_mail_grant(pool: &Pool, user_id: &str, grant: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE mail_grants SET grant = ?2, last_ok_at = ?3 WHERE user_id = ?1",
        params![user_id, grant, now_or_blank()],
    )?;
    Ok(())
}

pub fn clear_mail_grant(pool: &Pool, user_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM mail_grants WHERE user_id = ?1",
        params![user_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;

    #[test]
    fn a_grant_is_stored_read_back_renewed_and_cleared() {
        let p = pool();
        let user = mk_user(&p, "u@b.c", "user");

        set_mail_grant(&p, &user.id, "u@b.c", "v1.first").unwrap();
        let got = mail_grant(&p, &user.id).unwrap().unwrap();
        assert_eq!(got.email, "u@b.c");
        assert_eq!(got.grant, "v1.first");

        renew_mail_grant(&p, &user.id, "v1.second").unwrap();
        assert_eq!(mail_grant(&p, &user.id).unwrap().unwrap().grant, "v1.second");

        clear_mail_grant(&p, &user.id).unwrap();
        assert!(mail_grant(&p, &user.id).unwrap().is_none());
    }

    #[test]
    fn a_newer_grant_replaces_the_older_one() {
        let p = pool();
        let user = mk_user(&p, "u@b.c", "user");

        set_mail_grant(&p, &user.id, "u@b.c", "v1.first").unwrap();
        set_mail_grant(&p, &user.id, "u@b.c", "v1.second").unwrap();

        assert_eq!(mail_grant(&p, &user.id).unwrap().unwrap().grant, "v1.second");
    }

    #[test]
    fn a_grant_dies_with_the_address_it_was_minted_for() {
        let p = pool();
        let user = mk_user(&p, "u@b.c", "user");
        set_mail_grant(&p, &user.id, "u@b.c", "v1.first").unwrap();

        crate::accounts::set_user_email(&p, &user.id, "new@b.c").unwrap();

        assert!(mail_grant(&p, &user.id).unwrap().is_none());
    }

    #[test]
    fn a_grant_for_another_spelling_of_the_same_address_still_counts() {
        let p = pool();
        let user = mk_user(&p, "u@b.c", "user");

        set_mail_grant(&p, &user.id, "U@B.C", "v1.first").unwrap();

        assert!(mail_grant(&p, &user.id).unwrap().is_some());
    }
}
