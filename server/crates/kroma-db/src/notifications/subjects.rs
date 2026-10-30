//! What a page of notification rows needs looked up before their subjects can
//! become routes: where a requested title has landed, and who each actor is now.
//! Batched over the page, so an inbox costs two statements rather than two per row.

use std::collections::HashMap;

use kroma_domain::{NotificationActor, RequestKind, SubjectKind};

use super::StoredNotification;
use crate::{Connection, IN_CHUNK};

/// Where a requested title lives in the catalogue, once it is there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestedTitle {
    pub kind: RequestKind,
    pub id: String,
}

/// The lookups a page of rows needs, keyed by request id and by account id.
#[derive(Debug, Default)]
pub struct SubjectFacts {
    pub titles: HashMap<String, RequestedTitle>,
    pub actors: HashMap<String, NotificationActor>,
}

/// Resolve every request subject and every actor the page names, in two
/// statements.
pub fn subject_facts(
    conn: &Connection,
    rows: &[StoredNotification],
) -> rusqlite::Result<SubjectFacts> {
    let requests: Vec<&str> = unique(rows.iter().filter_map(|row| {
        row.subject
            .as_ref()
            .filter(|s| s.kind == SubjectKind::REQUEST)
            .map(|s| s.id.as_str())
    }));
    let accounts: Vec<&str> = unique(
        rows.iter()
            .flat_map(|row| [row.actor_id.as_deref(), row.resolved_by.as_deref()])
            .flatten(),
    );
    Ok(SubjectFacts {
        titles: requested_titles(conn, &requests)?,
        actors: actors(conn, &accounts)?,
    })
}

fn unique<'a>(ids: impl Iterator<Item = &'a str>) -> Vec<&'a str> {
    let mut seen: Vec<&str> = ids.collect();
    seen.sort_unstable();
    seen.dedup();
    seen
}

/// The catalogue row each named request now resolves to, skipping the requests
/// whose title has not arrived and the ids nothing matches.
pub fn requested_titles(
    conn: &Connection,
    request_ids: &[&str],
) -> rusqlite::Result<HashMap<String, RequestedTitle>> {
    let mut out = HashMap::with_capacity(request_ids.len());
    for chunk in request_ids.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let sql = format!(
            "SELECT r.id, r.kind, \
                COALESCE( \
                    (SELECT i.id FROM metadata_core c JOIN items i ON i.id = c.subject_id \
                     WHERE c.subject_kind = 'item' AND c.tmdb_id = r.tmdb_id \
                       AND i.kind IN ('movie', 'video') AND r.kind = 'movie' LIMIT 1), \
                    (SELECT s.id FROM metadata_core c JOIN shows s ON s.id = c.subject_id \
                     WHERE c.subject_kind = 'show' AND c.tmdb_id = r.tmdb_id \
                       AND r.kind = 'show' LIMIT 1) \
                ) \
             FROM requests r WHERE r.id IN ({ph})"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        })?;
        for row in rows {
            let (request_id, kind, title_id) = row?;
            let Some((kind, id)) = RequestKind::parse(&kind).zip(title_id) else {
                continue;
            };
            out.insert(request_id, RequestedTitle { kind, id });
        }
    }
    Ok(out)
}

/// The display name and avatar each named account carries now, skipping the
/// ones that have since been deleted.
pub fn actors(
    conn: &Connection,
    user_ids: &[&str],
) -> rusqlite::Result<HashMap<String, NotificationActor>> {
    let mut out = HashMap::with_capacity(user_ids.len());
    for chunk in user_ids.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT id, username, avatar_url FROM users WHERE id IN ({ph})"
        ))?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk), |r| {
            Ok(NotificationActor {
                id: r.get(0)?,
                name: r.get(1)?,
                avatar_url: r.get(2)?,
            })
        })?;
        for actor in rows {
            let actor = actor?;
            out.insert(actor.id.clone(), actor);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use kroma_domain::NotificationSubject;

    use super::*;
    use crate::notifications::test_support::new;
    use crate::testing::temp_pool;

    fn seeded() -> crate::testing::TempPool {
        let pool = temp_pool("notif-subjects");
        let conn = pool.get().unwrap();
        conn.execute_batch(
            "INSERT INTO users (id,email,username,avatar_url,password_hash,permissions,created_at) \
               VALUES ('u1','a@b.c','ana','/api/images/ana.webp','h','[\"playback\"]','t'); \
             INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('films','Films','movies','/m','t'); \
             INSERT INTO requests (id,kind,tmdb_id,title,status,requested_by,created_at,updated_at) \
               VALUES ('req-here','movie',42,'Dune','available','u1',0,0); \
             INSERT INTO requests (id,kind,tmdb_id,title,status,requested_by,created_at,updated_at) \
               VALUES ('req-away','movie',99,'Coyote','approved','u1',0,0); \
             INSERT INTO items (id,kind,title,container,library,added_at) \
               VALUES ('item-9','movie','Dune','mkv','films','t'); \
             INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) \
               VALUES ('item','item-9',42,0);",
        )
        .unwrap();
        pool
    }

    fn about(id: &str, subject: Option<NotificationSubject>, actor: Option<&str>) -> StoredNotification {
        StoredNotification {
            subject,
            actor_id: actor.map(str::to_string),
            ..new(id, 0)
        }
    }

    #[test]
    fn a_request_resolves_to_its_title_only_once_the_title_is_in_the_catalogue() {
        let pool = seeded();
        let conn = pool.get().unwrap();

        let found = requested_titles(&conn, &["req-here", "req-away", "req-ghost"]).unwrap();

        assert_eq!(
            found.get("req-here"),
            Some(&RequestedTitle {
                kind: RequestKind::Movie,
                id: "item-9".into()
            })
        );
        assert!(!found.contains_key("req-away"));
        assert!(!found.contains_key("req-ghost"));
    }

    #[test]
    fn an_actor_carries_the_name_and_avatar_the_account_has_now() {
        let pool = seeded();
        let conn = pool.get().unwrap();

        let found = actors(&conn, &["u1", "gone"]).unwrap();

        assert_eq!(found.len(), 1);
        assert_eq!(found["u1"].name, "ana");
        assert_eq!(
            found["u1"].avatar_url.as_deref(),
            Some("/api/images/ana.webp")
        );
    }

    #[test]
    fn a_page_asks_about_each_request_and_each_actor_once() {
        let pool = seeded();
        let conn = pool.get().unwrap();
        let rows = vec![
            about("n1", Some(NotificationSubject::request("req-here")), Some("u1")),
            about("n2", Some(NotificationSubject::request("req-here")), Some("u1")),
            about("n3", Some(NotificationSubject::movie("item-9")), None),
            about("n4", None, None),
        ];

        let facts = subject_facts(&conn, &rows).unwrap();

        assert_eq!(facts.titles.len(), 1);
        assert_eq!(facts.actors.len(), 1);
    }
}
