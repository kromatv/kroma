//! Per-user library visibility: the grant stored on an account, and which
//! library a title belongs to so a caller can weigh one against the other.

use std::collections::HashMap;

use rusqlite::OptionalExtension;

use super::*;

use kroma_domain::LibraryScope;

/// Replace an account's library grant. [`LibraryScope::All`] clears the column,
/// which is also how every account reads before an admin has ever set one.
pub fn set_user_libraries(pool: &Pool, user_id: &str, scope: &LibraryScope) -> Result<()> {
    let stored: Option<String> = match scope {
        LibraryScope::All => None,
        LibraryScope::Only(ids) => Some(serde_json::to_string(ids)?),
    };
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET libraries = ?2 WHERE id = ?1",
        params![user_id, stored],
    )?;
    Ok(())
}

pub fn item_library(pool: &Pool, item_id: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    Ok(conn
        .query_row(
            "SELECT library FROM items WHERE id = ?1",
            params![item_id],
            |r| r.get(0),
        )
        .optional()?)
}

pub fn show_library(pool: &Pool, show_id: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    Ok(conn
        .query_row(
            "SELECT library FROM shows WHERE id = ?1",
            params![show_id],
            |r| r.get(0),
        )
        .optional()?)
}

/// The library of each named item, skipping ids nothing matches.
pub fn item_libraries(pool: &Pool, item_ids: &[String]) -> Result<HashMap<String, String>> {
    if item_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let conn = pool.get()?;
    let ids: Vec<&str> = item_ids.iter().map(String::as_str).collect();
    let mut out = HashMap::with_capacity(ids.len());
    for chunk in ids.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&format!("SELECT id,library FROM items WHERE id IN ({ph})"))?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (id, library) = row?;
            out.insert(id, library);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::temp_pool;

    fn seeded() -> crate::testing::TempPool {
        let pool = temp_pool("visibility");
        let conn = pool.get().unwrap();
        conn.execute_batch(
            "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('films','Films','movies','/m','t');\
             INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('series','Series','shows','/s','t');\
             INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','A','mkv','films','t');\
             INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('e1','episode','B','mkv','series','t');\
             INSERT INTO shows (id,title,library,added_at) VALUES ('s1','S','series','t');\
             INSERT INTO users (id,email,username,password_hash,permissions,created_at) VALUES ('u1','a@b.c','alice','h','[\"playback\"]','t');",
        )
        .unwrap();
        pool
    }

    #[test]
    fn a_title_reports_the_library_it_was_scanned_into() {
        let pool = seeded();

        assert_eq!(item_library(&pool, "m1").unwrap().as_deref(), Some("films"));
        assert_eq!(
            item_library(&pool, "e1").unwrap().as_deref(),
            Some("series")
        );
        assert_eq!(
            show_library(&pool, "s1").unwrap().as_deref(),
            Some("series")
        );
        assert!(item_library(&pool, "ghost").unwrap().is_none());
        assert!(show_library(&pool, "ghost").unwrap().is_none());
    }

    #[test]
    fn a_batch_lookup_answers_only_for_the_ids_that_exist() {
        let pool = seeded();

        let found = item_libraries(&pool, &["m1".into(), "e1".into(), "ghost".into()]).unwrap();

        assert_eq!(found.len(), 2);
        assert_eq!(found.get("m1").map(String::as_str), Some("films"));
        assert_eq!(found.get("e1").map(String::as_str), Some("series"));
        assert!(item_libraries(&pool, &[]).unwrap().is_empty());
    }

    #[test]
    fn a_grant_round_trips_through_the_account_row() {
        let pool = seeded();

        assert_eq!(
            crate::user_by_id(&pool, "u1").unwrap().unwrap().libraries,
            LibraryScope::All
        );

        set_user_libraries(&pool, "u1", &LibraryScope::Only(vec!["films".into()])).unwrap();
        assert_eq!(
            crate::user_by_id(&pool, "u1").unwrap().unwrap().libraries,
            LibraryScope::Only(vec!["films".into()])
        );

        set_user_libraries(&pool, "u1", &LibraryScope::All).unwrap();
        assert_eq!(
            crate::user_by_id(&pool, "u1").unwrap().unwrap().libraries,
            LibraryScope::All
        );
    }
}
