use rusqlite::{params, Connection, Row};

use crate::db::EMBEDDED_CLIENT_ID;

pub struct ServableDownload {
    pub id: String,
    pub client_ref: String,
    pub request_id: Option<String>,
    pub kind: String,
    pub tmdb_id: Option<u64>,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub release_title: String,
    pub status: String,
    pub progress: f64,
    pub request_title: Option<String>,
    pub poster_url: Option<String>,
}

const SERVABLE_COLS: &str = "d.id, d.client_ref, d.request_id, d.kind, d.tmdb_id, d.title, \
    d.year, d.release_title, d.status, d.progress, r.title, r.poster_url";

// `imported` is absent on purpose: by then the film has a catalog row and the
// ordinary player is better in every way.
const SERVABLE_ROWS: &str = "FROM downloads d LEFT JOIN requests r ON r.id = d.request_id \
    WHERE d.client_id = ?1 AND d.client_ref != '' \
    AND d.status IN ('downloading', 'seeding', 'completed', 'paused')";

/// Whether a status is one the watch routes serve bytes under, one they have yet
/// to (so a caller is told to come back), or one they never will.
pub enum Servable {
    Now,
    NotYet,
    Never,
}

pub fn servable(status: &str) -> Servable {
    match status {
        "downloading" | "seeding" | "completed" | "paused" => Servable::Now,
        "imported" | "failed" | "removed" => Servable::Never,
        _ => Servable::NotYet,
    }
}

/// Every download the embedded engine can serve bytes for, newest first.
pub fn servable_downloads(
    conn: &Connection,
    limit: usize,
) -> rusqlite::Result<Vec<ServableDownload>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SERVABLE_COLS} {SERVABLE_ROWS} ORDER BY d.grabbed_at DESC LIMIT ?2"
    ))?;
    let rows = stmt.query_map(
        params![EMBEDDED_CLIENT_ID, limit as i64],
        row_to_servable_download,
    )?;
    rows.collect()
}

pub fn servable_download(
    conn: &Connection,
    id: &str,
) -> rusqlite::Result<Option<ServableDownload>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SERVABLE_COLS} {SERVABLE_ROWS} AND d.id = ?2"
    ))?;
    let mut rows = stmt.query_map(params![EMBEDDED_CLIENT_ID, id], row_to_servable_download)?;
    rows.next().transpose()
}

fn row_to_servable_download(r: &Row) -> rusqlite::Result<ServableDownload> {
    Ok(ServableDownload {
        id: r.get(0)?,
        client_ref: r.get(1)?,
        request_id: r.get(2)?,
        kind: r.get(3)?,
        tmdb_id: Some(r.get::<_, i64>(4)? as u64).filter(|id| *id != 0),
        title: r.get(5)?,
        year: r.get(6)?,
        release_title: r.get(7)?,
        status: r.get(8)?,
        progress: r.get(9)?,
        request_title: r.get(10)?,
        poster_url: r.get(11)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::{download, seed_request, test_db};
    use crate::db::{insert_download, DownloadRow};

    fn added(id: &str, status: &str, at: i64) -> DownloadRow {
        DownloadRow {
            client_ref: "deadbeef".into(),
            ..download(id, status, at)
        }
    }

    #[test]
    fn only_a_download_the_embedded_engine_holds_the_bytes_of_is_servable() {
        let pool = test_db();
        let statuses = [
            "downloading",
            "seeding",
            "completed",
            "paused",
            "queued",
            "failed",
            "removed",
            "imported",
        ];
        for (at, status) in (0..).zip(statuses) {
            insert_download(&pool, &added(&format!("d{at}"), status, at)).unwrap();
        }
        for row in [
            DownloadRow {
                client_id: "qbittorrent".into(),
                ..added("foreign", "downloading", 9)
            },
            DownloadRow {
                client_ref: String::new(),
                ..added("unadded", "downloading", 10)
            },
        ] {
            insert_download(&pool, &row).unwrap();
        }
        let conn = pool.get().unwrap();

        let servable = servable_downloads(&conn, 500).unwrap();

        assert_eq!(
            servable.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
            ["d3", "d2", "d1", "d0"]
        );
        assert!(servable_download(&conn, "foreign").unwrap().is_none());
        assert!(servable_download(&conn, "unadded").unwrap().is_none());
    }

    #[test]
    fn a_status_the_listing_will_never_serve_is_told_apart_from_one_it_has_yet_to() {
        let now = ["downloading", "seeding", "completed", "paused"]
            .map(|status| matches!(servable(status), Servable::Now));
        let never = ["imported", "failed", "removed"]
            .map(|status| matches!(servable(status), Servable::Never));

        assert_eq!(now, [true; 4]);
        assert_eq!(never, [true; 3]);
        assert!(matches!(servable("queued"), Servable::NotYet));
    }

    #[test]
    fn a_servable_download_carries_the_request_it_was_grabbed_for() {
        let pool = test_db();
        seed_request(&pool, "req1", "Sintel");
        insert_download(
            &pool,
            &DownloadRow {
                request_id: Some("req1".into()),
                ..added("d1", "downloading", 10)
            },
        )
        .unwrap();
        insert_download(&pool, &added("d2", "downloading", 20)).unwrap();
        let conn = pool.get().unwrap();

        let requested = servable_download(&conn, "d1").unwrap().unwrap();
        let orphan = servable_download(&conn, "d2").unwrap().unwrap();

        assert_eq!(requested.request_title.as_deref(), Some("Sintel"));
        assert_eq!(requested.request_id.as_deref(), Some("req1"));
        assert_eq!(orphan.request_title, None);
        assert_eq!(
            (orphan.tmdb_id, orphan.year, orphan.title.as_deref()),
            (Some(42), Some(2021), Some("Dune"))
        );
    }
}
