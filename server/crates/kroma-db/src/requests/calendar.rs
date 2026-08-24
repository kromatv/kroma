//! Reading the ledger as a calendar: what is coming, and what is still missing.

use rusqlite::{params, Connection, Row};

use kroma_domain::{CalendarEntry, RequestKind};

// Callers append their own `WHERE`/`ORDER BY`/`LIMIT` and map rows with `row_to_calendar_entry`.
const CALENDAR_SELECT: &str =
    "SELECT w.request_id, w.tmdb_id, r.kind, w.title, w.year, r.poster_url, \
                w.season, w.episode, w.air_date, w.status \
         FROM wanted w JOIN requests r ON r.id = w.request_id";

fn row_to_calendar_entry(r: &Row) -> rusqlite::Result<CalendarEntry> {
    let kind: String = r.get(2)?;
    Ok(CalendarEntry {
        request_id: Some(r.get(0)?),
        tmdb_id: r.get::<_, i64>(1)? as u64,
        kind: RequestKind::parse(&kind).unwrap_or(RequestKind::Movie),
        title: r.get(3)?,
        year: r.get(4)?,
        poster_url: r.get(5)?,
        season: r.get(6)?,
        episode: r.get(7)?,
        air_date: r.get(8)?,
        status: r.get(9)?,
    })
}

/// Future-dated wanted rows, soonest first. `requester` scopes to one user's
/// requests; `None` is the manager view spanning every request.
pub fn upcoming_calendar(
    conn: &Connection,
    today: &str,
    requester: Option<&str>,
    limit: usize,
) -> rusqlite::Result<Vec<CalendarEntry>> {
    let mut stmt = conn.prepare(&format!(
        "{CALENDAR_SELECT} \
         WHERE w.air_date IS NOT NULL AND w.air_date > ?1 \
           AND w.status IN ('wanted', 'grabbed') \
           AND r.status NOT IN ('denied', 'failed') \
           AND (?2 IS NULL OR r.requested_by = ?2) \
         ORDER BY w.air_date ASC, r.title ASC LIMIT ?3"
    ))?;
    let rows = stmt.query_map(
        params![today, requester, limit as i64],
        row_to_calendar_entry,
    )?;
    rows.collect()
}

/// The inverse of [`upcoming_calendar`]: aired-or-undated rows still `wanted`.
/// `requester` scopes to one user's requests; `None` spans all.
pub fn missing_items(
    conn: &Connection,
    today: &str,
    requester: Option<&str>,
    limit: usize,
) -> rusqlite::Result<Vec<CalendarEntry>> {
    let mut stmt = conn.prepare(&format!(
        "{CALENDAR_SELECT} \
         WHERE w.status = 'wanted' AND (w.air_date IS NULL OR w.air_date <= ?1) \
           AND r.status NOT IN ('denied', 'failed') \
           AND (?2 IS NULL OR r.requested_by = ?2) \
         ORDER BY r.title ASC, w.season ASC, w.episode ASC LIMIT ?3"
    ))?;
    let rows = stmt.query_map(
        params![today, requester, limit as i64],
        row_to_calendar_entry,
    )?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::requests::tests::*;
    use crate::requests::{insert_request, insert_wanted, replace_wanted, WantedRow};
    use kroma_domain::RequestStatus;

    #[test]
    fn missing_items_lists_aired_open_rows_only() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        let mk = |id: &str, episode: u32, air: Option<&str>, status: &str| WantedRow {
            id: id.into(),
            request_id: "r1".into(),
            kind: "episode".into(),
            tmdb_id: 1396,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season: Some(1),
            episode: Some(episode),
            air_date: air.map(str::to_string),
            status: status.into(),
            last_search_at: None,
        };
        replace_wanted(
            &p,
            "r1",
            &[
                mk("w-aired", 1, Some("2020-01-01"), "wanted"),
                mk("w-future", 2, Some("2999-01-01"), "wanted"),
                mk("w-grabbed", 3, Some("2020-01-01"), "grabbed"),
                mk("w-available", 4, Some("2020-01-01"), "available"),
                mk("w-undated", 5, None, "wanted"),
            ],
            1000,
        )
        .unwrap();

        let conn = p.get().unwrap();
        let missing = missing_items(&conn, "2026-07-05", None, 50).unwrap();
        let mut eps: Vec<u32> = missing.iter().filter_map(|e| e.episode).collect();
        eps.sort_unstable();
        assert_eq!(eps, vec![1, 5]);
        assert!(missing_items(&conn, "2026-07-05", Some("someone-else"), 50)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn the_calendar_shows_only_what_is_still_coming() {
        let pool = pool();
        req_by(&pool, "r-1", 1, RequestStatus::Approved, Some("ana"));

        insert_wanted(
            &pool,
            &[
                wanted_row("w-future", "r-1", Some("2030-01-01"), "wanted"),
                wanted_row("w-past", "r-1", Some("2020-01-01"), "wanted"),
                wanted_row("w-undated", "r-1", None, "wanted"),
                wanted_row("w-done", "r-1", Some("2030-02-01"), "available"),
                wanted_row("w-grabbed", "r-1", Some("2030-03-01"), "grabbed"),
            ],
            1_000,
        )
        .unwrap();

        let conn = pool.get().unwrap();
        let out = upcoming_calendar(&conn, "2026-01-01", None, 50).unwrap();
        let dates: Vec<&str> = out.iter().filter_map(|e| e.air_date.as_deref()).collect();
        assert_eq!(dates, ["2030-01-01", "2030-03-01"], "{out:?}");
        assert!(dates.windows(2).all(|w| w[0] <= w[1]));
    }

    #[test]
    fn a_denied_request_drops_off_the_calendar_entirely() {
        let pool = pool();
        req_by(&pool, "r-denied", 1, RequestStatus::Denied, Some("ana"));
        req_by(&pool, "r-live", 2, RequestStatus::Approved, Some("ana"));
        insert_wanted(
            &pool,
            &[
                wanted_row("w-dead", "r-denied", Some("2030-01-01"), "wanted"),
                wanted_row("w-live", "r-live", Some("2030-01-02"), "wanted"),
            ],
            1_000,
        )
        .unwrap();

        let conn = pool.get().unwrap();
        let out = upcoming_calendar(&conn, "2026-01-01", None, 50).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].request_id.as_deref(), Some("r-live"));
    }

    #[test]
    fn the_calendar_can_be_scoped_to_one_account_or_span_them_all() {
        let pool = pool();
        req_by(&pool, "r-ana", 1, RequestStatus::Approved, Some("ana"));
        req_by(&pool, "r-bo", 2, RequestStatus::Approved, Some("bo"));
        insert_wanted(
            &pool,
            &[
                wanted_row("w-a", "r-ana", Some("2030-01-01"), "wanted"),
                wanted_row("w-b", "r-bo", Some("2030-01-02"), "wanted"),
            ],
            1_000,
        )
        .unwrap();

        let conn = pool.get().unwrap();
        assert_eq!(
            upcoming_calendar(&conn, "2026-01-01", Some("ana"), 50)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            upcoming_calendar(&conn, "2026-01-01", None, 50)
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn the_calendar_honours_its_limit() {
        let pool = pool();
        req_by(&pool, "r-1", 1, RequestStatus::Approved, Some("ana"));
        let rows: Vec<WantedRow> = (1..=5)
            .map(|n| {
                wanted_row(
                    &format!("w-{n}"),
                    "r-1",
                    Some(&format!("2030-01-0{n}")),
                    "wanted",
                )
            })
            .collect();
        insert_wanted(&pool, &rows, 1_000).unwrap();

        let conn = pool.get().unwrap();
        let out = upcoming_calendar(&conn, "2026-01-01", None, 2).unwrap();
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].air_date.as_deref(), Some("2030-01-01"));
        assert_eq!(out[1].air_date.as_deref(), Some("2030-01-02"));
    }
}
