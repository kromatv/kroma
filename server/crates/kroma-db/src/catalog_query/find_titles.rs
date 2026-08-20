//! The filtered title listing a curating model browses with.

use anyhow::Result;
use rusqlite::types::Value as SqlValue;

use crate::rows::parse_metadata;
use crate::Pool;

use super::{CAT_CTE, DIRECTING_JOBS_SQL};

// Caps a single `find_titles` call so tool results re-entering the model's
// context stay bounded.
const MAX_LIMIT: usize = 50;
const DEFAULT_LIMIT: usize = 25;

/// A title in brief form (one `find_titles` row).
pub struct TitleBrief {
    pub id: String,
    pub title: String,
    pub year: Option<u32>,
    pub kind: String,
    pub rating: Option<f32>,
    pub genres: Vec<String>,
}

/// Composable `find_titles` filters all optional, AND-ed together.
#[derive(Default)]
pub struct TitleFilter {
    pub genre: Option<String>,
    pub director: Option<String>,
    pub actor: Option<String>,
    pub keyword: Option<String>,
    pub kind: Option<String>,
    pub year_min: Option<u32>,
    pub year_max: Option<u32>,
    pub min_rating: Option<f32>,
    pub sort: Option<String>,
    pub limit: Option<usize>,
}

/// List titles matching `filter`, ordered + capped. The heavy lifting is in
/// SQL; genres/rating are pulled from the parsed metadata so the struct stays
/// faithful to the model types.
pub fn find_titles(pool: &Pool, filter: &TitleFilter) -> Result<Vec<TitleBrief>> {
    let mut sql = String::from(CAT_CTE);
    sql.push_str("SELECT id,title,year,kind,metadata FROM cat WHERE 1=1");
    let mut p: Vec<SqlValue> = Vec::new();

    if let Some(g) = clean(&filter.genre) {
        sql.push_str(" AND EXISTS (SELECT 1 FROM json_each(cat.metadata,'$.genres') g WHERE g.value = ? COLLATE NOCASE)");
        p.push(SqlValue::Text(g));
    }
    if let Some(d) = clean(&filter.director) {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM json_each(cat.metadata,'$.crew') c \
              WHERE json_extract(c.value,'$.name') = ? COLLATE NOCASE \
              AND json_extract(c.value,'$.job') IN {DIRECTING_JOBS_SQL})"
        ));
        p.push(SqlValue::Text(d));
    }
    if let Some(a) = clean(&filter.actor) {
        sql.push_str(" AND EXISTS (SELECT 1 FROM json_each(cat.metadata,'$.cast') c WHERE json_extract(c.value,'$.name') = ? COLLATE NOCASE)");
        p.push(SqlValue::Text(a));
    }
    if let Some(k) = clean(&filter.keyword) {
        sql.push_str(" AND (cat.title LIKE ? COLLATE NOCASE OR IFNULL(json_extract(cat.metadata,'$.overview'),'') LIKE ? COLLATE NOCASE)");
        let like = format!("%{k}%");
        p.push(SqlValue::Text(like.clone()));
        p.push(SqlValue::Text(like));
    }
    if let Some(k) = clean(&filter.kind) {
        sql.push_str(" AND cat.kind = ?");
        p.push(SqlValue::Text(normalize_kind(&k)));
    }
    if let Some(y) = filter.year_min {
        sql.push_str(" AND cat.year >= ?");
        p.push(SqlValue::Integer(y as i64));
    }
    if let Some(y) = filter.year_max {
        sql.push_str(" AND cat.year <= ?");
        p.push(SqlValue::Integer(y as i64));
    }
    if let Some(r) = filter.min_rating {
        sql.push_str(" AND CAST(json_extract(cat.metadata,'$.rating') AS REAL) >= ?");
        p.push(SqlValue::Real(r as f64));
    }

    sql.push(' ');
    sql.push_str(order_clause(filter.sort.as_deref()));
    let lim = filter.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    sql.push_str(&format!(" LIMIT {lim}"));

    let conn = pool.get()?;
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(p.iter()), |r| {
            let meta = parse_metadata(r.get::<_, Option<String>>(4)?);
            Ok(TitleBrief {
                id: r.get(0)?,
                title: r.get(1)?,
                year: r.get(2)?,
                kind: r.get(3)?,
                rating: meta.as_ref().and_then(|m| m.rating),
                genres: meta.map(|m| m.genres).unwrap_or_default(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

// `ORDER BY` for the requested sort. Unrated titles sink last under `rating`
// (SQLite sorts NULL last under `DESC`).
fn order_clause(sort: Option<&str>) -> &'static str {
    match sort.map(str::trim).unwrap_or("rating") {
        "year" => "ORDER BY cat.year DESC",
        "title" => "ORDER BY cat.title COLLATE NOCASE ASC",
        _ => "ORDER BY CAST(json_extract(cat.metadata,'$.rating') AS REAL) DESC, cat.year DESC",
    }
}

fn normalize_kind(k: &str) -> String {
    match k.trim().to_ascii_lowercase().as_str() {
        "show" | "series" | "tv" | "serie" => "show".to_string(),
        _ => "movie".to_string(),
    }
}

// Trim a filter string and treat blank as absent.
fn clean(s: &Option<String>) -> Option<String> {
    s.as_deref().map(str::trim).filter(|t| !t.is_empty()).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog_query::test_support::*;

    #[test]
    fn genre_filter_and_kind() {
        let pool = seeded_pool();
        let horror = find_titles(&pool, &TitleFilter { genre: Some("Horror".into()), ..Default::default() }).unwrap();
        let ids: Vec<&str> = horror.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, ["m3", "m4"]); // rating DESC: Shining 8.4 then Hereditary 7.3

        // Sci-fi spans a movie + a show; kind filter narrows to the show.
        let scifi = find_titles(&pool, &TitleFilter { genre: Some("science fiction".into()), ..Default::default() }).unwrap();
        assert_eq!(scifi.len(), 2);
        let show_only =
            find_titles(&pool, &TitleFilter { genre: Some("Science Fiction".into()), kind: Some("series".into()), ..Default::default() })
                .unwrap();
        assert_eq!(show_only.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["s1"]);
        assert_eq!(show_only[0].kind, "show");
    }

    #[test]
    fn director_and_actor_filters() {
        let pool = seeded_pool();
        let dv = find_titles(&pool, &TitleFilter { director: Some("Denis Villeneuve".into()), ..Default::default() }).unwrap();
        assert_eq!(dv.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["m1", "m2"]);
        let blunt = find_titles(&pool, &TitleFilter { actor: Some("Emily Blunt".into()), ..Default::default() }).unwrap();
        assert_eq!(blunt.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["m2"]);
    }

    #[test]
    fn rating_year_sort_and_limit() {
        let pool = seeded_pool();
        let top = find_titles(&pool, &TitleFilter { min_rating: Some(8.0), ..Default::default() }).unwrap();
        // ≥8.0: Severance 8.7, Shining 8.4, Dune 8.0 newest sort would differ.
        assert_eq!(top.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["s1", "m3", "m1"]);

        let newest = find_titles(&pool, &TitleFilter { sort: Some("year".into()), limit: Some(2), ..Default::default() }).unwrap();
        assert_eq!(newest.len(), 2);
        assert_eq!(newest[0].id, "s1"); // 2022 newest

        // Episodes never appear in the catalog.
        let all = find_titles(&pool, &TitleFilter { limit: Some(50), ..Default::default() }).unwrap();
        assert!(all.iter().all(|t| t.id != "e1"));
        assert_eq!(all.len(), 6); // 5 movies + 1 show
    }

    #[test]
    fn the_keyword_filter_matches_the_title_or_the_overview() {
        let pool = seeded_pool();
        let ids = |filter: TitleFilter| {
            find_titles(&pool, &filter).unwrap().into_iter().map(|t| t.id).collect::<Vec<_>>()
        };

        assert_eq!(ids(TitleFilter { keyword: Some("shin".into()), ..Default::default() }), ["m3"]);
        let by_overview = ids(TitleFilter { keyword: Some("A FILM ABOUT".into()), limit: Some(50), ..Default::default() });
        assert!(by_overview.contains(&"m1".to_string()), "{by_overview:?}");
        assert!(!by_overview.contains(&"m5".to_string()), "m5 has no overview: {by_overview:?}");
        assert!(ids(TitleFilter { keyword: Some("nothing matches".into()), ..Default::default() }).is_empty());
    }

    #[test]
    fn the_year_bounds_are_inclusive_on_both_ends() {
        let pool = seeded_pool();
        let ids = |min, max| {
            find_titles(
                &pool,
                &TitleFilter { year_min: min, year_max: max, sort: Some("year".into()), limit: Some(50), ..Default::default() },
            )
            .unwrap()
            .into_iter()
            .map(|t| t.id)
            .collect::<Vec<_>>()
        };

        assert_eq!(ids(Some(2018), None), ["s1", "m1", "m4"]);
        assert_eq!(ids(None, Some(1990)), ["m5", "m3"]);
        assert_eq!(ids(Some(1980), Some(1980)), ["m3"], "both bounds include their year");
        assert!(ids(Some(2030), None).is_empty());
    }
}
