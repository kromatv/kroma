//! Who a digest goes to, and what the library added since it last ran.

use rusqlite::{params, Connection};

use kroma_domain::User;

/// Every account, for audience resolution: a household-sized table, scanned and
/// filtered in Rust rather than queried with `LIKE` on the permissions JSON.
/// Returns the full [`User`] since callers need both `permissions` (to filter)
/// and `language` (to render).
pub fn recipients(conn: &Connection) -> rusqlite::Result<Vec<User>> {
    let mut stmt = conn.prepare(
        "SELECT id,email,username,avatar_url,created_at,permissions,language,\
         (pin_hash IS NOT NULL),audio_language,subtitle_language FROM users ORDER BY created_at",
    )?;
    let rows = stmt.query_map([], crate::row_to_user)?;
    rows.collect()
}

/// The users who follow a show: it is in their list, they marked it watched, or
/// they have playback progress on one of its episodes. Drives "a new episode of
/// something you actually watch" without spamming the whole household.
pub fn followers_of_show(conn: &Connection, show_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT user_id FROM my_list WHERE item_id = ?1 \
         UNION SELECT user_id FROM watched WHERE item_id = ?1 \
         UNION SELECT p.user_id FROM progress p JOIN items i ON i.id = p.item_id \
         WHERE i.show_id = ?1",
    )?;
    let rows = stmt.query_map(params![show_id], |r| r.get::<_, String>(0))?;
    rows.collect()
}

/// A catalogue entry that appeared since a watermark, for the media digest.
/// `poster_url` is the show's for an episode, the title's own otherwise: an
/// episode's art is a still, which is not what an announcement should show.
#[derive(Debug, Clone)]
pub struct AddedTitle {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub show_id: Option<String>,
    pub show_title: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub added_at: String,
    pub poster_url: Option<String>,
}

/// Everything added to the catalogue strictly after `since` (ISO-8601, compared
/// lexicographically). `limit` bounds a first import or big re-scan from loading
/// the whole catalogue, since the digest only reports a count and a sample title.
pub fn items_added_since(
    conn: &Connection,
    since: &str,
    limit: usize,
) -> rusqlite::Result<Vec<AddedTitle>> {
    let mut stmt = conn.prepare(
        "SELECT i.id, i.kind, i.title, i.show_id, i.show_title, i.season, i.episode, i.added_at, \
                COALESCE(mcs.poster_url, json_extract(sh.metadata,'$.posterUrl'), \
                         mci.poster_url, json_extract(i.metadata,'$.posterUrl')) \
           FROM items i \
           LEFT JOIN shows sh ON sh.id = i.show_id \
           LEFT JOIN metadata_core mcs \
             ON mcs.subject_kind = 'show' AND mcs.subject_id = i.show_id \
           LEFT JOIN metadata_core mci \
             ON mci.subject_kind = 'item' AND mci.subject_id = i.id \
          WHERE i.added_at > ?1 ORDER BY i.added_at DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![since, limit as i64], |r| {
        Ok(AddedTitle {
            id: r.get(0)?,
            kind: r.get(1)?,
            title: r.get(2)?,
            show_id: r.get(3)?,
            show_title: r.get(4)?,
            season: r.get(5)?,
            episode: r.get(6)?,
            added_at: r.get(7)?,
            poster_url: r.get(8)?,
        })
    })?;
    rows.collect()
}

/// The newest `added_at` in the catalogue, for seeding the digest watermark on a
/// first run so an initial import never notifies anyone about 4000 films.
pub fn newest_added_at(conn: &Connection) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT MAX(added_at) FROM items", [], |r| r.get(0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifications::test_support::*;

    #[test]
    fn an_addition_carries_the_poster_the_notification_will_show() {
        let (p, _, _) = pool();
        let conn = p.get().unwrap();
        conn.execute_batch(
            "INSERT INTO libraries (id,name,kind,path,added_at) \
               VALUES ('lib','Films','movies','/x','2020-01-01T00:00:00Z'); \
             INSERT INTO shows (id,library,title,metadata,added_at) \
               VALUES ('shw','lib','Severance','{\"posterUrl\":\"/blob/shw.webp\"}','2020-01-01T00:00:00Z'); \
             INSERT INTO items (id,kind,title,container,library,added_at) \
               VALUES ('m1','movie','Dune','mkv','lib','2026-01-02T00:00:00Z'); \
             INSERT INTO items (id,kind,title,container,library,metadata,added_at) \
               VALUES ('m2','movie','Arrival','mkv','lib','{\"posterUrl\":\"/blob/m2.webp\"}','2026-01-03T00:00:00Z'); \
             INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
               VALUES ('e1','episode','Ep 4','mkv','lib','shw',1,4,'2026-01-04T00:00:00Z'); \
             INSERT INTO metadata_core (subject_kind,subject_id,poster_url,updated_at) \
               VALUES ('item','m1','/core/m1.webp',0);",
        )
        .unwrap();

        let added = items_added_since(&conn, "2026-01-01", 10).unwrap();
        let poster = |id: &str| added.iter().find(|a| a.id == id).unwrap().poster_url.clone();
        assert_eq!(poster("m1").as_deref(), Some("/core/m1.webp"));
        // Not yet re-enriched into `metadata_core`: the stored blob still answers.
        assert_eq!(poster("m2").as_deref(), Some("/blob/m2.webp"));
        // An episode has a still of its own, never a poster: the show's answers.
        assert_eq!(poster("e1").as_deref(), Some("/blob/shw.webp"));
    }

    #[test]
    fn the_digest_queries_report_a_missing_table_rather_than_an_empty_library() {
        let (p, _, _) = pool();
        let conn = p.get().unwrap();
        conn.execute_batch("DROP TABLE my_list; DROP TABLE items").unwrap();

        assert!(followers_of_show(&conn, "s1").is_err());
        assert!(items_added_since(&conn, "2020-01-01", 10).is_err());
    }
}
