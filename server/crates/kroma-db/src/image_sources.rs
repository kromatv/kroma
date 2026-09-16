//! Where each cached image came from (`image_sources`), which is what makes the
//! image directory a cache: a file the operator cleared is fetched again from
//! the URL that produced it, under the same content-addressed name.

use super::*;

/// Remember that `name` under the image dir was derived from `url`. Idempotent.
pub fn record(pool: &Pool, name: &str, url: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO image_sources (name, url) VALUES (?1, ?2)",
        params![name, url],
    )?;
    Ok(())
}

/// The URL `name` was derived from, when one was recorded.
pub fn source(pool: &Pool, name: &str) -> Result<Option<String>> {
    use rusqlite::OptionalExtension;
    let conn = pool.get()?;
    Ok(conn
        .query_row(
            "SELECT url FROM image_sources WHERE name = ?1",
            params![name],
            |r| r.get(0),
        )
        .optional()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_recorded_name_answers_its_url_and_a_stranger_answers_nothing() {
        let pool = crate::testing::temp_pool("image-sources");

        record(&pool, "abc.webp", "https://img.example/a.jpg").unwrap();

        assert_eq!(
            source(&pool, "abc.webp").unwrap().as_deref(),
            Some("https://img.example/a.jpg")
        );
        assert!(source(&pool, "zzz.webp").unwrap().is_none());
    }

    #[test]
    fn recording_a_name_again_is_a_no_op() {
        let pool = crate::testing::temp_pool("image-sources-again");

        record(&pool, "abc.webp", "https://img.example/a.jpg").unwrap();
        record(&pool, "abc.webp", "https://img.example/a.jpg").unwrap();

        assert_eq!(
            source(&pool, "abc.webp").unwrap().as_deref(),
            Some("https://img.example/a.jpg")
        );
    }
}
