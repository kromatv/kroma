//! Push endpoint persistence: one row per device a user has opted in on.
//!
//! A subscription is identified by `(transport, endpoint)`, not by user: a
//! browser re-subscribing hands back the same endpoint, and the same laptop may
//! be signed into a different account than last time. Upsert therefore moves an
//! endpoint to its current owner rather than duplicating it.
//!
//! Dead endpoints are pruned rather than retried forever a push service
//! rate-limits a sender that keeps posting to a 410.

use rusqlite::OptionalExtension;

use super::*;
use kroma_domain::PushTransport;

/// Consecutive failures after which an endpoint is dropped. Transient outages
/// (a service blip, a laptop offline) recover well inside this; a genuinely
/// dead endpoint reaches it and stops costing us requests.
pub const MAX_FAILURES: i64 = 8;

const SUB_COLS: &str = "id, user_id, transport, endpoint, p256dh, auth, device";

/// One device's push endpoint.
#[derive(Debug, Clone)]
pub struct PushSubscription {
    pub id: String,
    pub user_id: String,
    pub transport: PushTransport,
    pub endpoint: String,
    // Web Push only: the subscriber's public key and auth secret (base64url).
    pub p256dh: Option<String>,
    pub auth: Option<String>,
    pub device: Option<String>,
}

fn row_to_sub(r: &Row) -> rusqlite::Result<PushSubscription> {
    let transport: String = r.get(2)?;
    Ok(PushSubscription {
        id: r.get(0)?,
        user_id: r.get(1)?,
        // A row written by a newer build could name a transport this binary does
        // not know; treat it as Web Push rather than dropping the device from
        // the user's own "your devices" list.
        transport: PushTransport::parse(&transport).unwrap_or(PushTransport::WebPush),
        endpoint: r.get(3)?,
        p256dh: r.get(4)?,
        auth: r.get(5)?,
        device: r.get(6)?,
    })
}

/// A subscription to store.
pub struct NewSubscription {
    pub id: String,
    pub user_id: String,
    pub transport: PushTransport,
    pub endpoint: String,
    pub p256dh: Option<String>,
    pub auth: Option<String>,
    pub device: Option<String>,
}

/// Register (or re-register) an endpoint.
///
/// Conflicts on `(transport, endpoint)` reassign it to the calling user and
/// reset the failure count: the browser just proved the endpoint is alive.
pub fn upsert_subscription(pool: &Pool, sub: &NewSubscription, now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO push_subscriptions \
         (id, user_id, transport, endpoint, p256dh, auth, device, failures, created_at, last_ok_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, NULL) \
         ON CONFLICT(transport, endpoint) DO UPDATE SET \
           user_id = ?2, p256dh = ?5, auth = ?6, device = ?7, failures = 0",
        params![
            sub.id,
            sub.user_id,
            sub.transport.as_str(),
            sub.endpoint,
            sub.p256dh,
            sub.auth,
            sub.device,
            now_ms
        ],
    )?;
    Ok(())
}

/// Every endpoint a user has opted in on.
pub fn subscriptions_for_user(conn: &Connection, user_id: &str) -> rusqlite::Result<Vec<PushSubscription>> {
    let sql = format!("SELECT {SUB_COLS} FROM push_subscriptions WHERE user_id = ?1");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![user_id], row_to_sub)?;
    rows.collect()
}

/// Whether this user has any push endpoint at all (drives the settings toggle).
pub fn has_subscription(conn: &Connection, user_id: &str) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?1",
        params![user_id],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

/// Look one up by its endpoint (the browser knows only that).
pub fn find_by_endpoint(conn: &Connection, endpoint: &str) -> rusqlite::Result<Option<PushSubscription>> {
    let sql = format!("SELECT {SUB_COLS} FROM push_subscriptions WHERE endpoint = ?1");
    conn.query_row(&sql, params![endpoint], row_to_sub).optional()
}

/// Unsubscribe one endpoint, scoped to its owner so a known endpoint string
/// can't be used to silence someone else's device.
pub fn delete_subscription(pool: &Pool, user_id: &str, endpoint: &str) -> Result<bool> {
    let conn = pool.get()?;
    let n = conn.execute(
        "DELETE FROM push_subscriptions WHERE user_id = ?1 AND endpoint = ?2",
        params![user_id, endpoint],
    )?;
    Ok(n > 0)
}

/// Drop an endpoint outright the push service said it is gone.
pub fn drop_subscription(pool: &Pool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM push_subscriptions WHERE id = ?1", params![id])?;
    Ok(())
}

/// A delivery succeeded: clear the failure streak.
pub fn record_success(pool: &Pool, id: &str, now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE push_subscriptions SET failures = 0, last_ok_at = ?2 WHERE id = ?1",
        params![id, now_ms],
    )?;
    Ok(())
}

/// A delivery failed. Returns true once the endpoint has failed
/// [`MAX_FAILURES`] times in a row and should be dropped.
pub fn record_failure(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    conn.execute("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?1", params![id])?;
    let failures: i64 = conn
        .query_row("SELECT failures FROM push_subscriptions WHERE id = ?1", params![id], |r| r.get(0))
        .optional()?
        .unwrap_or(0);
    Ok(failures >= MAX_FAILURES)
}

#[cfg(test)]
mod tests {

    use super::*;
    use crate::testing::TempPool;

    fn pool() -> (TempPool, String, String) {
        let p = crate::testing::temp_pool("push");
        let a = crate::create_user(&p, "a@test.dev", "A", "h", &[]).unwrap().id;
        let b = crate::create_user(&p, "b@test.dev", "B", "h", &[]).unwrap().id;
        (p, a, b)
    }

    fn sub(id: &str, user: &str, endpoint: &str) -> NewSubscription {
        NewSubscription {
            id: id.into(),
            user_id: user.into(),
            transport: PushTransport::WebPush,
            endpoint: endpoint.into(),
            p256dh: Some("BCVxsr7N".into()),
            auth: Some("BTBZMqHH".into()),
            device: Some("Firefox on Mac".into()),
        }
    }

    #[test]
    fn upsert_stores_and_reads_back_the_keys() {
        let (p, a, _) = pool();
        upsert_subscription(&p, &sub("s1", &a, "https://push.example/1"), 1_000).unwrap();
        let conn = p.get().unwrap();
        let list = subscriptions_for_user(&conn, &a).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].endpoint, "https://push.example/1");
        assert_eq!(list[0].p256dh.as_deref(), Some("BCVxsr7N"));
        assert_eq!(list[0].transport, PushTransport::WebPush);
        assert!(has_subscription(&conn, &a).unwrap());
    }

    #[test]
    fn re_subscribing_the_same_endpoint_updates_rather_than_duplicates() {
        let (p, a, _) = pool();
        upsert_subscription(&p, &sub("s1", &a, "https://push.example/1"), 1_000).unwrap();
        let mut again = sub("s2", &a, "https://push.example/1");
        again.p256dh = Some("ROTATED".into());
        upsert_subscription(&p, &again, 2_000).unwrap();

        let conn = p.get().unwrap();
        let list = subscriptions_for_user(&conn, &a).unwrap();
        assert_eq!(list.len(), 1, "one endpoint, one row");
        assert_eq!(list[0].p256dh.as_deref(), Some("ROTATED"));
    }

    #[test]
    fn an_endpoint_moves_to_whoever_last_subscribed_it() {
        // The same browser, now signed into a different account. Leaving it on
        // the old account would push one user's notifications to another's screen.
        let (p, a, b) = pool();
        upsert_subscription(&p, &sub("s1", &a, "https://push.example/1"), 1_000).unwrap();
        upsert_subscription(&p, &sub("s2", &b, "https://push.example/1"), 2_000).unwrap();

        let conn = p.get().unwrap();
        assert!(subscriptions_for_user(&conn, &a).unwrap().is_empty());
        assert_eq!(subscriptions_for_user(&conn, &b).unwrap().len(), 1);
    }

    #[test]
    fn delete_is_scoped_to_the_owner() {
        let (p, a, b) = pool();
        upsert_subscription(&p, &sub("s1", &a, "https://push.example/1"), 1_000).unwrap();
        assert!(!delete_subscription(&p, &b, "https://push.example/1").unwrap());
        assert!(delete_subscription(&p, &a, "https://push.example/1").unwrap());
        let conn = p.get().unwrap();
        assert!(!has_subscription(&conn, &a).unwrap());
    }

    #[test]
    fn failures_accumulate_until_the_endpoint_is_declared_dead() {
        let (p, a, _) = pool();
        upsert_subscription(&p, &sub("s1", &a, "https://push.example/1"), 1_000).unwrap();
        for i in 1..MAX_FAILURES {
            assert!(!record_failure(&p, "s1").unwrap(), "still alive after {i} failures");
        }
        assert!(record_failure(&p, "s1").unwrap(), "dead on the {MAX_FAILURES}th");
    }

    #[test]
    fn a_success_clears_the_failure_streak() {
        let (p, a, _) = pool();
        upsert_subscription(&p, &sub("s1", &a, "https://push.example/1"), 1_000).unwrap();
        for _ in 0..(MAX_FAILURES - 1) {
            record_failure(&p, "s1").unwrap();
        }
        record_success(&p, "s1", 5_000).unwrap();
        // A laptop that was merely offline must not be one failure from eviction.
        assert!(!record_failure(&p, "s1").unwrap());
    }

    #[test]
    fn re_subscribing_also_clears_the_failure_streak() {
        let (p, a, _) = pool();
        upsert_subscription(&p, &sub("s1", &a, "https://push.example/1"), 1_000).unwrap();
        for _ in 0..(MAX_FAILURES - 1) {
            record_failure(&p, "s1").unwrap();
        }
        // The browser just proved the endpoint works by handing it to us again.
        upsert_subscription(&p, &sub("s1", &a, "https://push.example/1"), 2_000).unwrap();
        assert!(!record_failure(&p, "s1").unwrap());
    }

    #[test]
    fn dropping_and_finding_by_endpoint() {
        let (p, a, _) = pool();
        upsert_subscription(&p, &sub("s1", &a, "https://push.example/1"), 1_000).unwrap();
        let conn = p.get().unwrap();
        assert!(find_by_endpoint(&conn, "https://push.example/1").unwrap().is_some());
        assert!(find_by_endpoint(&conn, "https://push.example/nope").unwrap().is_none());
        drop(conn);
        drop_subscription(&p, "s1").unwrap();
        let conn = p.get().unwrap();
        assert!(find_by_endpoint(&conn, "https://push.example/1").unwrap().is_none());
    }

    #[test]
    fn deleting_a_user_takes_their_endpoints_with_them() {
        let (p, a, _) = pool();
        upsert_subscription(&p, &sub("s1", &a, "https://push.example/1"), 1_000).unwrap();
        let conn = p.get().unwrap();
        conn.execute("DELETE FROM users WHERE id = ?1", params![a]).unwrap();
        assert!(!has_subscription(&conn, &a).unwrap());
    }

    #[test]
    fn a_missing_endpoint_table_errors_rather_than_reporting_nobody_subscribed() {
        let (p, a, _) = pool();
        let conn = p.get().unwrap();
        conn.execute_batch("DROP TABLE push_subscriptions").unwrap();

        assert!(has_subscription(&conn, &a).is_err());
    }
}
