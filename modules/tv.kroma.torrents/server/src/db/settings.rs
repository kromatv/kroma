use anyhow::Result;
use rusqlite::params;

use super::Pool;

pub fn setting_i64(pool: &Pool, key: &str, default: i64) -> i64 {
    read(pool, key)
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

pub fn setting_bool(pool: &Pool, key: &str, default: bool) -> bool {
    read(pool, key)
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(default)
}

pub fn set_setting(pool: &Pool, key: &str, value: &str) -> Result<()> {
    pool.get()?.execute(
        "INSERT INTO module_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

fn read(pool: &Pool, key: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT value FROM module_settings WHERE key = ?1")?;
    Ok(stmt.query_row(params![key], |row| row.get(0)).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    use super::super::test_support::test_db;

    #[test]
    fn a_key_nothing_has_written_reads_as_the_default() {
        let pool = test_db();

        assert_eq!(setting_i64(&pool, "watchCacheMinutes", 30), 30);
        assert!(!setting_bool(&pool, "watchKeepInLibrary", false));
        assert!(setting_bool(&pool, "watchKeepInLibrary", true));
    }

    #[test]
    fn a_written_key_reads_back_in_the_shape_it_was_asked_for() {
        let pool = test_db();

        set_setting(&pool, "watchCacheMinutes", "5").unwrap();
        set_setting(&pool, "watchKeepInLibrary", "true").unwrap();

        assert_eq!(setting_i64(&pool, "watchCacheMinutes", 30), 5);
        assert!(setting_bool(&pool, "watchKeepInLibrary", false));
    }

    #[test]
    fn a_second_write_replaces_the_first_rather_than_failing() {
        let pool = test_db();

        set_setting(&pool, "watchCacheMinutes", "5").unwrap();
        set_setting(&pool, "watchCacheMinutes", "90").unwrap();

        assert_eq!(setting_i64(&pool, "watchCacheMinutes", 30), 90);
    }

    #[test]
    fn a_value_that_is_not_a_number_reads_as_the_default_rather_than_zero() {
        let pool = test_db();
        set_setting(&pool, "watchCacheMinutes", "soon").unwrap();

        assert_eq!(setting_i64(&pool, "watchCacheMinutes", 30), 30);
    }
}
