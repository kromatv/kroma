//! Join requests: people a provider vouched for who are waiting for an admin,
//! and the ones an admin declined.

use anyhow::Result;
use rusqlite::{params, OptionalExtension, Row, TransactionBehavior};

use crate::Pool;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JoinRequest {
    pub id: String,
    pub issuer: String,
    pub subject: String,
    pub username: String,
    pub email: String,
    pub name: Option<String>,
    pub blocked: bool,
    pub created_at: i64,
}

/// What a provider said about the person asking.
pub struct Applicant<'a> {
    pub issuer: &'a str,
    pub subject: &'a str,
    pub username: &'a str,
    pub email: &'a str,
    pub name: Option<&'a str>,
}

/// How filing a request ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Filed {
    New,
    AlreadyWaiting,
    Blocked,
    Full,
}

const COLUMNS: &str = "id,issuer,subject,username,email,name,blocked,created_at";

fn row_to_request(r: &Row) -> rusqlite::Result<JoinRequest> {
    Ok(JoinRequest {
        id: r.get(0)?,
        issuer: r.get(1)?,
        subject: r.get(2)?,
        username: r.get(3)?,
        email: r.get(4)?,
        name: r.get(5)?,
        blocked: r.get(6)?,
        created_at: r.get(7)?,
    })
}

/// Files a request unless the person already has one, was declined, or
/// `max_waiting` are open. Requests older than `expired_before` are dropped
/// first, so a list nobody reads does not stay full.
pub fn file_join_request(
    pool: &Pool,
    applicant: &Applicant,
    now: i64,
    expired_before: i64,
    max_waiting: i64,
) -> Result<Filed> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute(
        "DELETE FROM join_requests WHERE blocked = 0 AND created_at < ?1",
        params![expired_before],
    )?;
    let known: Option<bool> = tx
        .query_row(
            "SELECT blocked FROM join_requests WHERE issuer = ?1 AND subject = ?2",
            params![applicant.issuer, applicant.subject],
            |r| r.get(0),
        )
        .optional()?;
    let filed = match known {
        Some(true) => Filed::Blocked,
        Some(false) => Filed::AlreadyWaiting,
        None => {
            let waiting: i64 = tx.query_row(
                "SELECT COUNT(*) FROM join_requests WHERE blocked = 0",
                [],
                |r| r.get(0),
            )?;
            if waiting >= max_waiting {
                Filed::Full
            } else {
                tx.execute(
                    "INSERT INTO join_requests (id,issuer,subject,username,email,name,blocked,created_at) \
                     VALUES (?1,?2,?3,?4,?5,?6,0,?7)",
                    params![
                        kroma_primitives::short_hash(&format!(
                            "join|{}",
                            kroma_primitives::random_token()
                        )),
                        applicant.issuer,
                        applicant.subject,
                        applicant.username,
                        applicant.email,
                        applicant.name,
                        now
                    ],
                )?;
                Filed::New
            }
        }
    };
    tx.commit()?;
    Ok(filed)
}

/// Oldest first: the waiting ones, or the declined ones when `blocked`.
pub fn list_join_requests(pool: &Pool, blocked: bool) -> Result<Vec<JoinRequest>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM join_requests WHERE blocked = ?1 ORDER BY created_at, rowid"
    ))?;
    let rows = stmt.query_map(params![blocked], row_to_request)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn join_request(pool: &Pool, id: &str) -> Result<Option<JoinRequest>> {
    let conn = pool.get()?;
    Ok(conn
        .query_row(
            &format!("SELECT {COLUMNS} FROM join_requests WHERE id = ?1"),
            params![id],
            row_to_request,
        )
        .optional()?)
}

pub fn is_identity_blocked(pool: &Pool, issuer: &str, subject: &str) -> Result<bool> {
    let conn = pool.get()?;
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM join_requests WHERE issuer = ?1 AND subject = ?2 AND blocked = 1)",
        params![issuer, subject],
        |r| r.get(0),
    )?)
}

/// Declines a waiting request: the row stays, so the identity cannot ask again.
pub fn block_join_request(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let changed = conn.execute(
        "UPDATE join_requests SET blocked = 1 WHERE id = ?1 AND blocked = 0",
        params![id],
    )?;
    Ok(changed == 1)
}

/// Removes a request, waiting or declined. Removing a declined one unblocks it.
pub fn delete_join_request(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let removed = conn.execute("DELETE FROM join_requests WHERE id = ?1", params![id])?;
    Ok(removed == 1)
}

/// Drops the waiting request of an identity that got in another way.
pub fn settle_join_request(pool: &Pool, issuer: &str, subject: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM join_requests WHERE issuer = ?1 AND subject = ?2 AND blocked = 0",
        params![issuer, subject],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::test_support::pool;
    use super::*;

    const ISSUER: &str = "https://id.test";
    const NOW: i64 = 1_000_000;
    const NEVER: i64 = 0;

    fn applicant(subject: &str) -> Applicant<'_> {
        Applicant {
            issuer: ISSUER,
            subject,
            username: "lea",
            email: "lea@id.test",
            name: Some("Léa"),
        }
    }

    fn file(pool: &Pool, subject: &str) -> Filed {
        file_join_request(pool, &applicant(subject), NOW, NEVER, 2).unwrap()
    }

    #[test]
    fn a_first_request_is_filed_and_listed_with_what_the_provider_said() {
        let p = pool();

        let filed = file(&p, "sub-lea");

        assert_eq!(filed, Filed::New);
        let waiting = list_join_requests(&p, false).unwrap();
        assert_eq!(waiting.len(), 1);
        assert_eq!(waiting[0].email, "lea@id.test");
        assert_eq!(waiting[0].name.as_deref(), Some("Léa"));
        assert_eq!(join_request(&p, &waiting[0].id).unwrap(), Some(waiting[0].clone()));
    }

    #[test]
    fn asking_twice_files_one_request() {
        let p = pool();
        file(&p, "sub-lea");

        let again = file(&p, "sub-lea");

        assert_eq!(again, Filed::AlreadyWaiting);
        assert_eq!(list_join_requests(&p, false).unwrap().len(), 1);
    }

    #[test]
    fn a_full_list_refuses_the_next_person() {
        let p = pool();
        file(&p, "one");
        file(&p, "two");

        let third = file(&p, "three");

        assert_eq!(third, Filed::Full);
    }

    #[test]
    fn a_declined_identity_cannot_ask_again_until_it_is_unblocked() {
        let p = pool();
        file(&p, "sub-lea");
        let id = list_join_requests(&p, false).unwrap().remove(0).id;

        assert!(block_join_request(&p, &id).unwrap());

        assert_eq!(file(&p, "sub-lea"), Filed::Blocked);
        assert!(is_identity_blocked(&p, ISSUER, "sub-lea").unwrap());
        assert!(list_join_requests(&p, false).unwrap().is_empty());
        assert_eq!(list_join_requests(&p, true).unwrap().len(), 1);

        assert!(delete_join_request(&p, &id).unwrap());

        assert!(!is_identity_blocked(&p, ISSUER, "sub-lea").unwrap());
        assert_eq!(file(&p, "sub-lea"), Filed::New);
    }

    #[test]
    fn declined_identities_do_not_count_against_the_waiting_limit() {
        let p = pool();
        file(&p, "one");
        file(&p, "two");
        for request in list_join_requests(&p, false).unwrap() {
            block_join_request(&p, &request.id).unwrap();
        }

        let next = file(&p, "three");

        assert_eq!(next, Filed::New);
    }

    #[test]
    fn a_request_past_its_age_makes_room_and_a_declined_one_is_kept() {
        let p = pool();
        file(&p, "old");
        file(&p, "declined");
        let declined = list_join_requests(&p, false).unwrap().remove(1).id;
        block_join_request(&p, &declined).unwrap();

        let filed =
            file_join_request(&p, &applicant("new"), NOW + 10, NOW + 5, 1).unwrap();

        assert_eq!(filed, Filed::New);
        let waiting = list_join_requests(&p, false).unwrap();
        assert_eq!(waiting.len(), 1);
        assert_eq!(waiting[0].subject, "new");
        assert_eq!(list_join_requests(&p, true).unwrap().len(), 1);
    }

    #[test]
    fn settling_drops_a_waiting_request_and_leaves_a_declined_one() {
        let p = pool();
        file(&p, "waiting");
        file(&p, "declined");
        let declined = list_join_requests(&p, false).unwrap().remove(1).id;
        block_join_request(&p, &declined).unwrap();

        settle_join_request(&p, ISSUER, "waiting").unwrap();
        settle_join_request(&p, ISSUER, "declined").unwrap();

        assert!(list_join_requests(&p, false).unwrap().is_empty());
        assert!(is_identity_blocked(&p, ISSUER, "declined").unwrap());
    }
}
