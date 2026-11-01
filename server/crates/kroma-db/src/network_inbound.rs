//! The daily tally of requests clients make of this server: one row per day,
//! address, road in and User-Agent.

use super::network_flows::{day_of, RETENTION_DAYS};
use super::{params, Pool, Result};

/// One tally row, or a delta to fold into one. `day` counts days since the Unix
/// epoch, in UTC.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InboundTally {
    pub day: i64,
    pub address: String,
    pub via: String,
    pub user_agent: String,
    pub count: i64,
    pub bytes_in: i64,
    pub bytes_out: i64,
    pub last_at: i64,
}

/// Fold each delta into its day's row, in one transaction.
pub fn add(pool: &Pool, deltas: &[InboundTally]) -> Result<()> {
    if deltas.is_empty() {
        return Ok(());
    }
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    {
        let mut upsert = tx.prepare(
            "INSERT INTO network_inbound_daily \
                 (day, address, via, user_agent, count, bytes_in, bytes_out, last_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
             ON CONFLICT (day, address, via, user_agent) DO UPDATE SET \
                 count = count + excluded.count, \
                 bytes_in = bytes_in + excluded.bytes_in, \
                 bytes_out = bytes_out + excluded.bytes_out, \
                 last_at = MAX(last_at, excluded.last_at)",
        )?;
        for d in deltas {
            upsert.execute(params![
                d.day,
                d.address,
                d.via,
                d.user_agent,
                d.count,
                d.bytes_in,
                d.bytes_out,
                d.last_at
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Every tally from `since_day` on, summed across days, the most recently seen
/// first and at most `limit` rows. `day` is `since_day` in every row returned.
pub fn since(pool: &Pool, since_day: i64, limit: usize) -> Result<Vec<InboundTally>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT address, via, user_agent, \
                SUM(count), SUM(bytes_in), SUM(bytes_out), MAX(last_at) \
         FROM network_inbound_daily WHERE day >= ?1 \
         GROUP BY address, via, user_agent \
         ORDER BY MAX(last_at) DESC LIMIT ?2",
    )?;
    let limit = i64::try_from(limit).unwrap_or(i64::MAX);
    let rows = stmt.query_map(params![since_day, limit], |r| {
        Ok(InboundTally {
            day: since_day,
            address: r.get(0)?,
            via: r.get(1)?,
            user_agent: r.get(2)?,
            count: r.get(3)?,
            bytes_in: r.get(4)?,
            bytes_out: r.get(5)?,
            last_at: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct InboundTotals {
    pub requests: i64,
    pub addresses: i64,
    pub bytes_in: i64,
    pub bytes_out: i64,
}

pub fn totals_since(pool: &Pool, since_day: i64) -> Result<InboundTotals> {
    let conn = pool.get()?;
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(count), 0), COUNT(DISTINCT address), \
                COALESCE(SUM(bytes_in), 0), COALESCE(SUM(bytes_out), 0) \
         FROM network_inbound_daily WHERE day >= ?1",
        params![since_day],
        |r| {
            Ok(InboundTotals {
                requests: r.get(0)?,
                addresses: r.get(1)?,
                bytes_in: r.get(2)?,
                bytes_out: r.get(3)?,
            })
        },
    )?)
}

/// Drop the days older than [`RETENTION_DAYS`]. `now_ms` is epoch milliseconds.
pub fn prune(pool: &Pool, now_ms: i64) -> Result<usize> {
    let cutoff = day_of(now_ms) - RETENTION_DAYS;
    let conn = pool.get()?;
    Ok(conn.execute(
        "DELETE FROM network_inbound_daily WHERE day < ?1",
        params![cutoff],
    )?)
}

#[cfg(test)]
mod tests;
