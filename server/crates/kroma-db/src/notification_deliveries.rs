//! What became of each push attempt, so "why didn't my phone ring?" has an
//! answer.
//!
//! A record outlives both ends it describes: the notification is pruned at 200
//! rows per account, and a dead endpoint is dropped the moment a push service
//! says it is gone. So the subscription and the notification are named by id
//! rather than joined to, and the device's own label is copied in at write time.
//!
//! What is never written here is an address: an endpoint, a device token and a
//! relay grant are credentials, and the record exists to be read by a person.

use super::{params, Connection, Pool, Result, Row};
use kroma_domain::{DeliveryAccount, DeliveryStatus, NotificationDelivery, PushTransport};

/// How long a record is kept.
pub const RETENTION_DAYS: i64 = 30;

const DELIVERY_COLS: &str = "d.id, d.notification_id, d.subscription_id, d.device, \
    d.transport, d.status, d.error, d.created_at";

/// One attempt to record.
pub struct NewDelivery<'a> {
    pub id: String,
    pub user_id: &'a str,
    pub notification_id: Option<&'a str>,
    pub subscription_id: Option<&'a str>,
    pub device: Option<&'a str>,
    pub transport: PushTransport,
    pub status: DeliveryStatus,
    pub error: Option<String>,
    pub created_at: i64,
}

fn row_to_delivery(r: &Row) -> rusqlite::Result<NotificationDelivery> {
    let transport: String = r.get(4)?;
    let status: String = r.get(5)?;
    Ok(NotificationDelivery {
        id: r.get(0)?,
        notification_id: r.get(1)?,
        device_id: r.get(2)?,
        device: r.get(3)?,
        transport: PushTransport::parse(&transport).unwrap_or(PushTransport::WebPush),
        status: DeliveryStatus::parse(&status).unwrap_or(DeliveryStatus::Failed),
        error: r.get(6)?,
        account: None,
        created_at: r.get(7)?,
    })
}

/// Write one attempt. Failing to record must never cost the push itself, so
/// callers log and carry on.
pub fn record(conn: &Connection, d: &NewDelivery<'_>) -> Result<()> {
    conn.execute(
        "INSERT INTO notification_deliveries \
         (id, user_id, notification_id, subscription_id, device, transport, status, error, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            d.id,
            d.user_id,
            d.notification_id,
            d.subscription_id,
            d.device,
            d.transport.as_str(),
            d.status.as_str(),
            d.error,
            d.created_at
        ],
    )?;
    Ok(())
}

/// One account's own attempts, newest first.
pub fn deliveries_for_user(
    conn: &Connection,
    user_id: &str,
    limit: usize,
) -> rusqlite::Result<Vec<NotificationDelivery>> {
    let sql = format!(
        "SELECT {DELIVERY_COLS} FROM notification_deliveries d \
         WHERE d.user_id = ?1 ORDER BY d.created_at DESC, d.rowid DESC LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![user_id, limit as i64], row_to_delivery)?;
    rows.collect()
}

/// Every account's attempts, newest first, each naming whose device it was.
pub fn recent_deliveries(
    conn: &Connection,
    limit: usize,
) -> rusqlite::Result<Vec<NotificationDelivery>> {
    let sql = format!(
        "SELECT {DELIVERY_COLS}, d.user_id, u.username \
         FROM notification_deliveries d LEFT JOIN users u ON u.id = d.user_id \
         ORDER BY d.created_at DESC, d.rowid DESC LIMIT ?1"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![limit as i64], |r| {
        let mut delivery = row_to_delivery(r)?;
        let id: String = r.get(8)?;
        let username: Option<String> = r.get(9)?;
        delivery.account = Some(DeliveryAccount {
            id,
            username: username.unwrap_or_default(),
        });
        Ok(delivery)
    })?;
    rows.collect()
}

/// Drop records older than [`RETENTION_DAYS`]. `now_ms` is epoch milliseconds.
pub fn prune(pool: &Pool, now_ms: i64) -> Result<usize> {
    let cutoff = now_ms - RETENTION_DAYS * 24 * 3_600 * 1_000;
    let conn = pool.get()?;
    Ok(conn.execute(
        "DELETE FROM notification_deliveries WHERE created_at < ?1",
        params![cutoff],
    )?)
}

#[cfg(test)]
mod tests;
