//! Library-scan gaps: aired episodes a show on disk is missing.

use anyhow::Result;
use rusqlite::{params, Connection};

use crate::pool::Pool;
use kroma_domain::{CalendarEntry, RequestKind};

/// Replace one show's library-scan gaps (aired TMDB episodes not on disk) in one
/// transaction. `rows` = (season, episode, air_date); empty clears the show.
pub fn replace_show_gaps(
    pool: &Pool,
    show_id: &str,
    tmdb_id: u64,
    title: &str,
    poster_url: Option<&str>,
    rows: &[(u32, u32, Option<String>)],
    now_ms: i64,
) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM library_gaps WHERE show_id = ?1", params![show_id])?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO library_gaps (show_id, tmdb_id, title, poster_url, season, episode, air_date, detected_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for (season, episode, air_date) in rows {
            stmt.execute(params![
                show_id,
                tmdb_id as i64,
                title,
                poster_url,
                season,
                episode,
                air_date,
                now_ms
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Library-scan gaps as [`CalendarEntry`] with `request_id = None` — they are not
/// requests yet. Shows with an open request for the same tmdb id are excluded,
/// since that request's ledger already tracks them.
pub fn library_gaps_list(conn: &Connection, limit: usize) -> rusqlite::Result<Vec<CalendarEntry>> {
    let mut stmt = conn.prepare(
        "SELECT g.tmdb_id, g.title, g.poster_url, g.season, g.episode, g.air_date \
         FROM library_gaps g \
         WHERE NOT EXISTS ( \
             SELECT 1 FROM requests r \
             WHERE r.tmdb_id = g.tmdb_id AND r.kind = 'show' \
               AND r.status NOT IN ('denied', 'failed') \
         ) \
         ORDER BY g.title ASC, g.season ASC, g.episode ASC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], |r| {
        Ok(CalendarEntry {
            request_id: None,
            tmdb_id: r.get::<_, i64>(0)? as u64,
            kind: RequestKind::Show,
            title: r.get(1)?,
            year: None,
            poster_url: r.get(2)?,
            season: r.get(3)?,
            episode: r.get(4)?,
            air_date: r.get(5)?,
            status: "missing".into(),
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::requests::tests::*;
    use crate::requests::{episodes_present, insert_request, set_request_status};
    use kroma_domain::RequestStatus;

    #[test]
    fn replace_show_gaps_rewrites_only_that_show() {
        let p = pool();
        seed_show(&p, "s1");
        seed_show(&p, "s2");
        replace_show_gaps(&p, "s1", 1, "Alpha", None, &[gap(1, 1, "2020-01-01")], 1).unwrap();
        replace_show_gaps(&p, "s2", 2, "Beta", None, &[gap(1, 1, "2020-01-01")], 1).unwrap();

        replace_show_gaps(&p, "s1", 1, "Alpha", None, &[gap(2, 5, "2021-02-02")], 2).unwrap();
        let conn = p.get().unwrap();
        let rows = library_gaps_list(&conn, 50).unwrap();
        assert_eq!(rows.len(), 2);
        let alpha = rows.iter().find(|r| r.title == "Alpha").unwrap();
        assert_eq!((alpha.season, alpha.episode), (Some(2), Some(5)));
        assert!(rows.iter().any(|r| r.title == "Beta"));
    }

    #[test]
    fn replace_show_gaps_with_no_rows_clears_a_now_complete_show() {
        let p = pool();
        seed_show(&p, "s1");
        replace_show_gaps(&p, "s1", 1, "Alpha", None, &[gap(1, 1, "2020-01-01")], 1).unwrap();
        replace_show_gaps(&p, "s1", 1, "Alpha", None, &[], 2).unwrap();
        assert!(library_gaps_list(&p.get().unwrap(), 50).unwrap().is_empty());
    }

    #[test]
    fn library_gaps_list_reports_gaps_as_unrequested_missing_rows() {
        let p = pool();
        seed_show(&p, "s1");
        replace_show_gaps(&p, "s1", 42, "Alpha", Some("/p.jpg"), &[gap(1, 3, "2020-01-01")], 1)
            .unwrap();

        let rows = library_gaps_list(&p.get().unwrap(), 50).unwrap();
        assert_eq!(rows.len(), 1);
        let r = &rows[0];
        assert!(r.request_id.is_none());
        assert_eq!(r.status, "missing");
        assert_eq!(r.tmdb_id, 42);
        assert_eq!(r.poster_url.as_deref(), Some("/p.jpg"));
        assert_eq!(r.air_date.as_deref(), Some("2020-01-01"));
    }

    #[test]
    fn library_gaps_list_hides_a_show_that_already_has_an_open_request() {
        let p = pool();
        seed_show(&p, "s1");
        replace_show_gaps(&p, "s1", 42, "Alpha", None, &[gap(1, 1, "2020-01-01")], 1).unwrap();
        insert_request(&p, &new_req("r1", RequestKind::Show, 42, None), 1).unwrap();

        assert!(library_gaps_list(&p.get().unwrap(), 50).unwrap().is_empty());
    }

    #[test]
    fn library_gaps_list_shows_a_gap_again_once_its_request_is_denied() {
        let p = pool();
        seed_show(&p, "s1");
        replace_show_gaps(&p, "s1", 42, "Alpha", None, &[gap(1, 1, "2020-01-01")], 1).unwrap();
        insert_request(&p, &new_req("r1", RequestKind::Show, 42, None), 1).unwrap();
        assert!(library_gaps_list(&p.get().unwrap(), 50).unwrap().is_empty());

        set_request_status(&p, "r1", RequestStatus::Denied, None, None, 2).unwrap();
        assert_eq!(library_gaps_list(&p.get().unwrap(), 50).unwrap().len(), 1);
    }

    #[test]
    fn library_gaps_list_ignores_a_movie_request_for_the_same_tmdb_id() {
        let p = pool();
        seed_show(&p, "s1");
        replace_show_gaps(&p, "s1", 42, "Alpha", None, &[gap(1, 1, "2020-01-01")], 1).unwrap();
        // tmdb ids are unique only within a kind.
        insert_request(&p, &new_req("r1", RequestKind::Movie, 42, None), 1).unwrap();
        assert_eq!(library_gaps_list(&p.get().unwrap(), 50).unwrap().len(), 1);
    }

    #[test]
    fn library_gaps_list_sorts_by_title_then_episode_and_honours_the_limit() {
        let p = pool();
        seed_show(&p, "s1");
        seed_show(&p, "s2");
        replace_show_gaps(&p, "s2", 2, "Beta", None, &[gap(1, 1, "2020-01-01")], 1).unwrap();
        replace_show_gaps(
            &p,
            "s1",
            1,
            "Alpha",
            None,
            &[gap(2, 1, "2020-01-01"), gap(1, 2, "2020-01-01")],
            1,
        )
        .unwrap();

        let conn = p.get().unwrap();
        let rows = library_gaps_list(&conn, 50).unwrap();
        let seen: Vec<(String, Option<u32>, Option<u32>)> =
            rows.iter().map(|r| (r.title.clone(), r.season, r.episode)).collect();
        assert_eq!(
            seen,
            vec![
                ("Alpha".into(), Some(1), Some(2)),
                ("Alpha".into(), Some(2), Some(1)),
                ("Beta".into(), Some(1), Some(1)),
            ]
        );
        assert_eq!(library_gaps_list(&conn, 2).unwrap().len(), 2);
    }

    #[test]
    fn the_calendar_and_episode_readers_error_when_their_tables_are_gone() {
        let pool = pool();
        let conn = pool.get().unwrap();
        conn.execute_batch("DROP TABLE library_gaps; DROP TABLE items").unwrap();

        assert!(library_gaps_list(&conn, 10).is_err());
        assert!(episodes_present(&conn, "s1").is_err());
    }
}
