//! Whether a name or an address already belongs to an account.

use anyhow::Result;
use rusqlite::{params, Connection};

use crate::Pool;

/// Checks the username column (case-sensitive, as username login resolves) AND
/// the email column (case-insensitive): a username equal to someone's email
/// would otherwise shadow that victim's email login through the
/// `email = ?1 OR username = ?1` in `find_user_by_login`. `exclude_id` skips the
/// caller's own row.
pub fn username_taken(pool: &Pool, username: &str, exclude_id: Option<&str>) -> Result<bool> {
    Ok(name_in_use(&*pool.get()?, username, exclude_id)?)
}

/// Whether an account other than `exclude_id` holds the address, whatever its
/// case. An account that waits on an invitation holds its address too.
pub fn email_taken(pool: &Pool, email: &str, exclude_id: Option<&str>) -> Result<bool> {
    Ok(address_in_use(&*pool.get()?, email, exclude_id)?)
}

pub(super) fn name_in_use(
    conn: &Connection,
    username: &str,
    exclude_id: Option<&str>,
) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM users \
         WHERE (username = ?1 OR email = ?1 COLLATE NOCASE) AND (?2 IS NULL OR id <> ?2))",
        params![username, exclude_id],
        |r| r.get(0),
    )
}

pub(super) fn address_in_use(
    conn: &Connection,
    email: &str,
    exclude_id: Option<&str>,
) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM users WHERE email = ?1 AND (?2 IS NULL OR id <> ?2))",
        params![email, exclude_id],
        |r| r.get(0),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;

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
    fn a_name_check_that_cannot_read_the_table_refuses_rather_than_reporting_free() {
        let p = pool();
        p.get().unwrap().execute_batch("DROP TABLE users").unwrap();

        assert!(username_taken(&p, "alice", None).is_err());
        assert!(username_taken(&p, "alice", Some("u1")).is_err());
    }

    #[test]
    fn an_address_is_taken_in_any_case_by_anyone_but_its_own_account() {
        let p = pool();
        let ana = mk_user(&p, "Ana@Test.dev", "ana");

        assert!(email_taken(&p, "ana@test.dev", None).unwrap());
        assert!(email_taken(&p, "ana@test.dev", Some("someone-else")).unwrap());
        assert!(!email_taken(&p, "ana@test.dev", Some(&ana.id)).unwrap());
        assert!(!email_taken(&p, "bo@test.dev", None).unwrap());
    }
}
