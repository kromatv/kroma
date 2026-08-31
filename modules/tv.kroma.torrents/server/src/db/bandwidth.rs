use anyhow::Result;
use rusqlite::params;

use super::Pool;

const COLS: &str = "at,step_secs,sealed_down_bytes,sealed_up_bytes,unsealed_down_bytes,\
    unsealed_up_bytes,bypass_down_bytes,bypass_up_bytes,sealed_secs,unsealed_secs";

/// One stored window of the tunnel's throughput. `at` is the unix second it
/// opens on and `step_secs` how wide it is.
///
/// `sealed` moved through the bridge with the seal probe holding, `unsealed`
/// moved on the engine the bridge carries while it did not, and `bypass` moved
/// on an engine the bridge never carries.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct BandwidthSample {
    pub at: i64,
    pub step_secs: i64,
    pub sealed_down_bytes: u64,
    pub sealed_up_bytes: u64,
    pub unsealed_down_bytes: u64,
    pub unsealed_up_bytes: u64,
    pub bypass_down_bytes: u64,
    pub bypass_up_bytes: u64,
    pub sealed_secs: i64,
    pub unsealed_secs: i64,
}

const ADD_EXCLUDED: &str = "sealed_down_bytes = sealed_down_bytes + excluded.sealed_down_bytes, \
    sealed_up_bytes = sealed_up_bytes + excluded.sealed_up_bytes, \
    unsealed_down_bytes = unsealed_down_bytes + excluded.unsealed_down_bytes, \
    unsealed_up_bytes = unsealed_up_bytes + excluded.unsealed_up_bytes, \
    bypass_down_bytes = bypass_down_bytes + excluded.bypass_down_bytes, \
    bypass_up_bytes = bypass_up_bytes + excluded.bypass_up_bytes, \
    sealed_secs = sealed_secs + excluded.sealed_secs, \
    unsealed_secs = unsealed_secs + excluded.unsealed_secs";

/// Add one window's totals to whatever already sits at the same `(step, at)`.
pub fn add_bandwidth_sample(pool: &Pool, sample: &BandwidthSample) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        &format!(
            "INSERT INTO vpn_bandwidth ({COLS}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) \
             ON CONFLICT(step_secs, at) DO UPDATE SET {ADD_EXCLUDED}"
        ),
        params![
            sample.at,
            sample.step_secs,
            sample.sealed_down_bytes as i64,
            sample.sealed_up_bytes as i64,
            sample.unsealed_down_bytes as i64,
            sample.unsealed_up_bytes as i64,
            sample.bypass_down_bytes as i64,
            sample.bypass_up_bytes as i64,
            sample.sealed_secs,
            sample.unsealed_secs,
        ],
    )?;
    Ok(())
}

/// Every stored window opening in `[from, to)`, oldest first.
pub fn bandwidth_samples(pool: &Pool, from: i64, to: i64) -> Result<Vec<BandwidthSample>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM vpn_bandwidth WHERE at >= ?1 AND at < ?2 ORDER BY at"
    ))?;
    let rows = stmt.query_map(params![from, to], |r| {
        Ok(BandwidthSample {
            at: r.get(0)?,
            step_secs: r.get(1)?,
            sealed_down_bytes: r.get::<_, i64>(2)?.max(0) as u64,
            sealed_up_bytes: r.get::<_, i64>(3)?.max(0) as u64,
            unsealed_down_bytes: r.get::<_, i64>(4)?.max(0) as u64,
            unsealed_up_bytes: r.get::<_, i64>(5)?.max(0) as u64,
            bypass_down_bytes: r.get::<_, i64>(6)?.max(0) as u64,
            bypass_up_bytes: r.get::<_, i64>(7)?.max(0) as u64,
            sealed_secs: r.get(8)?,
            unsealed_secs: r.get(9)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// The unix second of the oldest stored window, or `None` on an empty record.
pub fn earliest_bandwidth_sample(pool: &Pool) -> Result<Option<i64>> {
    let conn = pool.get()?;
    Ok(conn.query_row("SELECT MIN(at) FROM vpn_bandwidth", [], |r| r.get(0))?)
}

/// Fold every window finer than `step` that closes before `before` into whole
/// `step`-wide windows, each the SUM of what it replaces, and drop the rows it
/// folded. Returns how many rows were folded away.
///
/// `before` is rounded down to a `step` boundary, so a coarse window is only
/// built once every fine row inside it is old enough and none is counted twice.
pub fn fold_bandwidth_samples(pool: &Pool, before: i64, step: i64) -> Result<usize> {
    let aligned = before.div_euclid(step) * step;
    let conn = pool.get()?;
    conn.execute(
        &format!(
            "INSERT INTO vpn_bandwidth ({COLS}) \
             SELECT (at / ?2) * ?2, ?2, SUM(sealed_down_bytes), SUM(sealed_up_bytes), \
                SUM(unsealed_down_bytes), SUM(unsealed_up_bytes), SUM(bypass_down_bytes), \
                SUM(bypass_up_bytes), SUM(sealed_secs), SUM(unsealed_secs) \
             FROM vpn_bandwidth WHERE at < ?1 AND step_secs < ?2 GROUP BY at / ?2 \
             ON CONFLICT(step_secs, at) DO UPDATE SET {ADD_EXCLUDED}"
        ),
        params![aligned, step],
    )?;
    let folded = conn.execute(
        "DELETE FROM vpn_bandwidth WHERE at < ?1 AND step_secs < ?2",
        params![aligned, step],
    )?;
    Ok(folded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::test_db;

    fn sample(at: i64, step_secs: i64, sealed: u64, unsealed: u64) -> BandwidthSample {
        BandwidthSample {
            at,
            step_secs,
            sealed_down_bytes: sealed,
            sealed_up_bytes: sealed / 2,
            unsealed_down_bytes: unsealed,
            unsealed_up_bytes: unsealed / 2,
            bypass_down_bytes: 7,
            bypass_up_bytes: 3,
            sealed_secs: if unsealed == 0 { step_secs } else { 0 },
            unsealed_secs: if unsealed == 0 { 0 } else { step_secs },
        }
    }

    #[test]
    fn reads_back_only_the_windows_opening_inside_the_asked_span() {
        let pool = test_db();
        for at in [0, 60, 120, 180] {
            add_bandwidth_sample(&pool, &sample(at, 60, 1000, 0)).unwrap();
        }

        let read = bandwidth_samples(&pool, 60, 180).unwrap();

        assert_eq!(read.iter().map(|s| s.at).collect::<Vec<_>>(), [60, 120]);
    }

    #[test]
    fn a_second_write_on_one_window_adds_to_it_rather_than_replacing_it() {
        let pool = test_db();
        add_bandwidth_sample(&pool, &sample(0, 60, 1000, 0)).unwrap();

        add_bandwidth_sample(&pool, &sample(0, 60, 250, 0)).unwrap();

        let read = bandwidth_samples(&pool, 0, 60).unwrap();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].sealed_down_bytes, 1250);
        assert_eq!(read[0].sealed_secs, 120);
    }

    #[test]
    fn folding_sums_the_windows_it_replaces_and_drops_them() {
        let pool = test_db();
        add_bandwidth_sample(&pool, &sample(0, 60, 1000, 0)).unwrap();
        add_bandwidth_sample(&pool, &sample(60, 60, 400, 50)).unwrap();

        let folded = fold_bandwidth_samples(&pool, 300, 300).unwrap();

        let read = bandwidth_samples(&pool, 0, 300).unwrap();
        assert_eq!(folded, 2);
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].step_secs, 300);
        assert_eq!(read[0].sealed_down_bytes, 1400);
        assert_eq!(read[0].unsealed_down_bytes, 50);
        assert_eq!(read[0].unsealed_secs, 60);
    }

    #[test]
    fn a_window_the_threshold_falls_inside_is_left_alone_until_it_closes() {
        let pool = test_db();
        add_bandwidth_sample(&pool, &sample(360, 60, 1000, 0)).unwrap();

        let folded = fold_bandwidth_samples(&pool, 420, 300).unwrap();

        assert_eq!(folded, 0);
        assert_eq!(bandwidth_samples(&pool, 0, 600).unwrap()[0].step_secs, 60);
    }

    #[test]
    fn an_empty_record_names_no_earliest_window() {
        let pool = test_db();

        assert_eq!(earliest_bandwidth_sample(&pool).unwrap(), None);

        add_bandwidth_sample(&pool, &sample(900, 60, 1, 0)).unwrap();
        assert_eq!(earliest_bandwidth_sample(&pool).unwrap(), Some(900));
    }
}
