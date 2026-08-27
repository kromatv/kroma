use rusqlite::types::ToSqlOutput;
use rusqlite::{Connection, ToSql};

use super::{row_to_download, DownloadOrder, DownloadRow, DL_COLS};

/// What the queue is narrowed to. Fields are additive and an empty filter is
/// the whole ledger, so the unfiltered page is the same query path as any
/// other.
#[derive(Debug, Clone, Default)]
pub struct DownloadFilter {
    pub statuses: Vec<String>,
    pub client_ids: Vec<String>,
    /// `movie` | `season` | `episode`; empty is every kind.
    pub kinds: Vec<String>,
    /// Substring of the release name or the resolved title.
    pub search: Option<String>,
    /// Only rows no TMDB title has been pinned to yet.
    pub unlinked: bool,
}

// LIKE treats these as wildcards, so a release name containing one would widen
// the search instead of narrowing it. Paired with `ESCAPE '\'` below.
fn like_pattern(needle: &str) -> String {
    let mut out = String::with_capacity(needle.len() + 2);
    out.push('%');
    for c in needle.chars() {
        if matches!(c, '%' | '_' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('%');
    out
}

enum Bound {
    Text(String),
    Int(i64),
}

impl ToSql for Bound {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        match self {
            Bound::Text(s) => s.to_sql(),
            Bound::Int(n) => n.to_sql(),
        }
    }
}

// One `column IN (…)` term, or nothing when the caller named no values. Values
// are always bound; only the PLACEHOLDER numbering is built from how many binds
// the clauses before it already took.
fn any_of(column: &str, values: &[String], binds: &mut Vec<Bound>) -> Option<String> {
    if values.is_empty() {
        return None;
    }
    let slots: Vec<String> = (0..values.len())
        .map(|i| format!("?{}", binds.len() + 1 + i))
        .collect();
    binds.extend(values.iter().map(|v| Bound::Text(v.clone())));
    Some(format!("{column} IN ({})", slots.join(", ")))
}

fn where_clause(filter: &DownloadFilter) -> (String, Vec<Bound>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut binds: Vec<Bound> = Vec::new();

    clauses.extend(any_of("status", &filter.statuses, &mut binds));
    clauses.extend(any_of("client_id", &filter.client_ids, &mut binds));
    clauses.extend(any_of("kind", &filter.kinds, &mut binds));
    if let Some(search) = &filter.search {
        let slot = format!("?{}", binds.len() + 1);
        clauses.push(format!(
            "(release_title LIKE {slot} ESCAPE '\\' OR COALESCE(title, '') LIKE {slot} ESCAPE '\\')"
        ));
        binds.push(Bound::Text(like_pattern(search)));
    }
    if filter.unlinked {
        clauses.push("tmdb_id = 0".to_string());
    }

    if clauses.is_empty() {
        (String::new(), binds)
    } else {
        (format!(" WHERE {}", clauses.join(" AND ")), binds)
    }
}

/// How many rows the filter matches, for the page count.
pub fn count_downloads(conn: &Connection, filter: &DownloadFilter) -> rusqlite::Result<i64> {
    let (where_sql, binds) = where_clause(filter);
    let params: Vec<&dyn ToSql> = binds.iter().map(|b| b as &dyn ToSql).collect();
    conn.query_row(
        &format!("SELECT COUNT(*) FROM downloads{where_sql}"),
        params.as_slice(),
        |r| r.get(0),
    )
}

/// One page of the filtered ledger, in the asked-for order.
pub fn page_downloads(
    conn: &Connection,
    filter: &DownloadFilter,
    order: DownloadOrder,
    offset: i64,
    limit: i64,
) -> rusqlite::Result<Vec<DownloadRow>> {
    let (where_sql, mut binds) = where_clause(filter);
    let order_sql = order.clause();
    let limit_slot = format!("?{}", binds.len() + 1);
    let offset_slot = format!("?{}", binds.len() + 2);
    binds.push(Bound::Int(limit));
    binds.push(Bound::Int(offset));
    let params: Vec<&dyn ToSql> = binds.iter().map(|b| b as &dyn ToSql).collect();
    let mut stmt = conn.prepare(&format!(
        "SELECT {DL_COLS} FROM downloads{where_sql} \
         {order_sql} LIMIT {limit_slot} OFFSET {offset_slot}"
    ))?;
    let rows = stmt.query_map(params.as_slice(), row_to_download)?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::super::write::*;
    use super::*;
    use crate::db::test_support::{download, seed_request, seeded_ledger, test_db};
    use crate::db::{DownloadSort, SortDirection};

    #[test]
    fn an_empty_filter_pages_the_whole_ledger_newest_first() {
        let pool = seeded_ledger();
        let conn = pool.get().unwrap();
        let filter = DownloadFilter::default();

        let first = page_downloads(&conn, &filter, DownloadOrder::default(), 0, 2).unwrap();
        let second = page_downloads(&conn, &filter, DownloadOrder::default(), 2, 2).unwrap();

        assert_eq!(count_downloads(&conn, &filter).unwrap(), 5);
        assert_eq!(
            first.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
            ["d_f", "d_c"]
        );
        assert_eq!(
            second.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
            ["d_s", "d_d"]
        );
    }

    #[test]
    fn a_status_filter_narrows_the_count_and_the_page_together() {
        let pool = seeded_ledger();
        let conn = pool.get().unwrap();
        let filter = DownloadFilter {
            statuses: vec!["downloading".into(), "seeding".into()],
            ..DownloadFilter::default()
        };

        let page = page_downloads(&conn, &filter, DownloadOrder::default(), 0, 25).unwrap();

        assert_eq!(count_downloads(&conn, &filter).unwrap(), 2);
        assert_eq!(
            page.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
            ["d_s", "d_d"]
        );
    }

    #[test]
    fn a_search_matches_the_release_name_and_treats_a_wildcard_as_a_literal() {
        let pool = test_db();
        let mut plain = download("plain", "queued", 10);
        plain.release_title = "Frieren.S01.1080p".into();
        let mut percent = download("percent", "queued", 20);
        percent.release_title = "100%.Wolf.2020".into();
        insert_download(&pool, &plain).unwrap();
        insert_download(&pool, &percent).unwrap();
        let conn = pool.get().unwrap();

        let hit = DownloadFilter {
            search: Some("frieren".into()),
            ..DownloadFilter::default()
        };
        let literal = DownloadFilter {
            search: Some("100%".into()),
            ..DownloadFilter::default()
        };

        assert_eq!(count_downloads(&conn, &hit).unwrap(), 1);
        assert_eq!(count_downloads(&conn, &literal).unwrap(), 1);
        assert_eq!(
            page_downloads(&conn, &literal, DownloadOrder::default(), 0, 25).unwrap()[0].id,
            "percent"
        );
    }

    #[test]
    fn a_sort_narrows_with_the_filter_and_carries_across_the_page_break() {
        let pool = test_db();
        for (id, title) in [("z", "Zulu"), ("a", "Alpha"), ("m", "Mike")] {
            let mut row = download(id, "queued", 10);
            row.title = Some(title.into());
            insert_download(&pool, &row).unwrap();
        }
        insert_download(&pool, &download("done", "completed", 99)).unwrap();
        let conn = pool.get().unwrap();
        let filter = DownloadFilter {
            statuses: vec!["queued".into()],
            ..DownloadFilter::default()
        };
        let order = DownloadOrder {
            sort: DownloadSort::Release,
            direction: SortDirection::Ascending,
        };

        let first = page_downloads(&conn, &filter, order, 0, 2).unwrap();
        let second = page_downloads(&conn, &filter, order, 2, 2).unwrap();

        assert_eq!(
            first.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
            ["a", "m"]
        );
        assert_eq!(
            second.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
            ["z"]
        );
    }

    #[test]
    fn sorting_by_release_follows_the_name_the_row_shows_not_the_scene_string() {
        let pool = test_db();
        seed_request(&pool, "req_a", "Alien");
        let mut requested = download("requested", "queued", 10);
        requested.request_id = Some("req_a".into());
        requested.title = Some("Zulu".into());
        let mut pinned = download("pinned", "queued", 20);
        pinned.title = Some("Mike".into());
        let mut orphan = download("orphan", "queued", 30);
        orphan.title = None;
        orphan.tmdb_id = None;
        orphan.release_title = "Bravo.2021".into();
        for row in [&requested, &pinned, &orphan] {
            insert_download(&pool, row).unwrap();
        }
        let conn = pool.get().unwrap();
        let order = DownloadOrder {
            sort: DownloadSort::Release,
            direction: SortDirection::Ascending,
        };

        let page = page_downloads(&conn, &DownloadFilter::default(), order, 0, 25).unwrap();

        assert_eq!(
            page.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
            ["requested", "orphan", "pinned"]
        );
    }

    #[test]
    fn unlinked_keeps_only_the_rows_no_title_was_pinned_to() {
        let pool = test_db();
        let mut linked = download("linked", "queued", 10);
        linked.tmdb_id = Some(1399);
        let mut orphan = download("orphan", "queued", 20);
        orphan.tmdb_id = None;
        insert_download(&pool, &linked).unwrap();
        insert_download(&pool, &orphan).unwrap();
        let conn = pool.get().unwrap();

        let filter = DownloadFilter {
            unlinked: true,
            ..DownloadFilter::default()
        };

        assert_eq!(count_downloads(&conn, &filter).unwrap(), 1);
        assert_eq!(
            page_downloads(&conn, &filter, DownloadOrder::default(), 0, 25).unwrap()[0].id,
            "orphan"
        );
    }
}
