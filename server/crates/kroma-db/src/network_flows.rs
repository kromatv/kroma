//! The daily tally of outbound flows: one row per day, caller, purpose, host,
//! route and verdict. A tally names a host and never a URL.

use super::{Pool, Result, params};

/// How long a day's tally is kept.
pub const RETENTION_DAYS: i64 = 30;

const DAY_MS: i64 = 86_400_000;

/// One tally row, or a delta to fold into one. `day` counts days since the
/// Unix epoch, in UTC.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlowTally {
    pub day: i64,
    pub caller: String,
    pub purpose: String,
    pub host: String,
    pub route: String,
    pub verdict: String,
    pub count: i64,
    pub bytes_in: i64,
    pub bytes_out: i64,
    pub last_at: i64,
}

/// The UTC day `at_ms` (epoch milliseconds) falls on.
pub fn day_of(at_ms: i64) -> i64 {
    at_ms.div_euclid(DAY_MS)
}

/// Fold each delta into its day's row, in one transaction.
pub fn add(pool: &Pool, deltas: &[FlowTally]) -> Result<()> {
    if deltas.is_empty() {
        return Ok(());
    }
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    {
        let mut upsert = tx.prepare(
            "INSERT INTO network_flows_daily \
                 (day, caller, purpose, host, route, verdict, count, bytes_in, bytes_out, last_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) \
             ON CONFLICT (day, caller, purpose, host, route, verdict) DO UPDATE SET \
                 count = count + excluded.count, \
                 bytes_in = bytes_in + excluded.bytes_in, \
                 bytes_out = bytes_out + excluded.bytes_out, \
                 last_at = MAX(last_at, excluded.last_at)",
        )?;
        for d in deltas {
            upsert.execute(params![
                d.day,
                d.caller,
                d.purpose,
                d.host,
                d.route,
                d.verdict,
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

/// Every tally from `since_day` on, summed across days, busiest first and at
/// most `limit` rows. `day` is `since_day` in every row returned.
pub fn since(pool: &Pool, since_day: i64, limit: usize) -> Result<Vec<FlowTally>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT caller, purpose, host, route, verdict, \
                SUM(count), SUM(bytes_in), SUM(bytes_out), MAX(last_at) \
         FROM network_flows_daily WHERE day >= ?1 \
         GROUP BY caller, purpose, host, route, verdict \
         ORDER BY SUM(count) DESC, MAX(last_at) DESC LIMIT ?2",
    )?;
    let limit = i64::try_from(limit).unwrap_or(i64::MAX);
    let rows = stmt.query_map(params![since_day, limit], |r| {
        Ok(FlowTally {
            day: since_day,
            caller: r.get(0)?,
            purpose: r.get(1)?,
            host: r.get(2)?,
            route: r.get(3)?,
            verdict: r.get(4)?,
            count: r.get(5)?,
            bytes_in: r.get(6)?,
            bytes_out: r.get(7)?,
            last_at: r.get(8)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct FlowTotals {
    pub flows: i64,
    pub blocked: i64,
    pub bytes_in: i64,
    pub bytes_out: i64,
}

/// The sums over every tally from `since_day` on.
pub fn totals_since(pool: &Pool, since_day: i64) -> Result<FlowTotals> {
    let conn = pool.get()?;
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(count), 0), \
                COALESCE(SUM(CASE WHEN verdict = 'blocked' THEN count ELSE 0 END), 0), \
                COALESCE(SUM(bytes_in), 0), COALESCE(SUM(bytes_out), 0) \
         FROM network_flows_daily WHERE day >= ?1",
        params![since_day],
        |r| {
            Ok(FlowTotals {
                flows: r.get(0)?,
                blocked: r.get(1)?,
                bytes_in: r.get(2)?,
                bytes_out: r.get(3)?,
            })
        },
    )?)
}

/// Every `(caller, purpose)` pair any kept tally names.
pub fn purposes(pool: &Pool) -> Result<Vec<(String, String)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT caller, purpose FROM network_flows_daily ORDER BY caller, purpose",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Drop the days older than [`RETENTION_DAYS`]. `now_ms` is epoch milliseconds.
pub fn prune(pool: &Pool, now_ms: i64) -> Result<usize> {
    let cutoff = day_of(now_ms) - RETENTION_DAYS;
    let conn = pool.get()?;
    Ok(conn.execute(
        "DELETE FROM network_flows_daily WHERE day < ?1",
        params![cutoff],
    )?)
}

#[cfg(test)]
mod tests;
