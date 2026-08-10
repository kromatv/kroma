//! Admin console: settings store, member management, play history + analytics
//! and library/storage stats.

use super::*;

use rusqlite::OptionalExtension;

/// Every persisted setting as `(key, value)` pairs (value is parsed JSON).
pub fn settings_all(pool: &Pool) -> Result<Vec<(String, serde_json::Value)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT key,value FROM settings")?;
    let rows = stmt.query_map([], |r| {
        let k: String = r.get(0)?;
        let v: String = r.get(1)?;
        Ok((k, v))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (k, raw) = row?;
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
            out.push((k, v));
        }
    }
    Ok(out)
}

/// Upsert one setting (value stored as compact JSON).
pub fn settings_set(pool: &Pool, key: &str, value: &serde_json::Value) -> Result<()> {
    let conn = pool.get()?;
    let json = serde_json::to_string(value)?;
    conn.execute(
        "INSERT INTO settings (key,value,updated_at) VALUES (?1,?2,?3) \
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        params![key, json, now_or_blank()],
    )?;
    Ok(())
}

fn row_to_admin_user(r: &Row) -> rusqlite::Result<User> {
    // Reuse the User shape: cols 0..=5 match row_to_user, col 6 carries last_seen
    // (read as `language`, ignored by the caller, which re-reads col 6 itself),
    // col 7 is the has_pin flag, cols 8..=9 the playback-language prefs. The
    // caller's SELECT must project all ten.
    row_to_user(r)
}

/// All accounts for the admin "Membres & partage" table, oldest first (owner is
/// account 0). `online` is left false here the handler fills it from the live
/// playback registry.
pub fn admin_users(pool: &Pool) -> Result<Vec<kroma_domain::AdminUser>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,email,username,avatar_url,created_at,permissions,last_seen,(pin_hash IS NOT NULL),audio_language,subtitle_language \
         FROM users ORDER BY created_at",
    )?;
    let rows = stmt.query_map([], |r| {
        let user = row_to_admin_user(r)?;
        let last_seen: Option<String> = r.get(6)?;
        Ok((user, last_seen))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (u, last_seen) = row?;
        out.push(kroma_domain::AdminUser {
            role: kroma_domain::role_label(&u.permissions).to_string(),
            id: u.id,
            email: u.email,
            username: u.username,
            avatar_url: u.avatar_url,
            permissions: u.permissions,
            created_at: u.created_at,
            last_seen,
            online: false,
        });
    }
    Ok(out)
}

/// Fetch one full user by id (with email + permissions), or `None`.
#[allow(dead_code)] // public lookup helper; used by admin tooling/tests.
pub fn get_user(pool: &Pool, id: &str) -> Result<Option<User>> {
    let conn = pool.get()?;
    let user = conn
        .query_row(
            "SELECT id,email,username,avatar_url,created_at,permissions,language,(pin_hash IS NOT NULL),audio_language,subtitle_language FROM users WHERE id = ?1",
            params![id],
            row_to_user,
        )
        .optional()?;
    Ok(user)
}

/// Replace a user's permission set.
pub fn update_user_permissions(pool: &Pool, id: &str, permissions: &[Permission]) -> Result<()> {
    let conn = pool.get()?;
    let perms_json = serde_json::to_string(permissions).unwrap_or_else(|_| "[\"playback\"]".into());
    conn.execute(
        "UPDATE users SET permissions = ?2 WHERE id = ?1",
        params![id, perms_json],
    )?;
    Ok(())
}

pub fn set_user_username(pool: &Pool, id: &str, username: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET username = ?2 WHERE id = ?1",
        params![id, username],
    )?;
    Ok(())
}

/// Delete a user (cascades sessions + progress).
pub fn delete_user(pool: &Pool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM users WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn touch_last_seen(pool: &Pool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET last_seen = ?2 WHERE id = ?1",
        params![id, now_or_blank()],
    )?;
    Ok(())
}

/// Append one finished playback to the history log.
#[allow(clippy::too_many_arguments)]
pub fn record_play(
    pool: &Pool,
    user_id: Option<&str>,
    username: Option<&str>,
    item_id: Option<&str>,
    kind: &str,
    title: &str,
    library: Option<&str>,
    started_at: i64,
    ended_at: i64,
    watched_ms: i64,
) -> Result<()> {
    let conn = pool.get()?;
    let id = kroma_primitives::short_hash(&format!(
        "play|{}|{}|{started_at}|{}",
        user_id.unwrap_or("?"),
        item_id.unwrap_or("?"),
        kroma_primitives::random_token()
    ));
    conn.execute(
        "INSERT INTO play_history \
         (id,user_id,username,item_id,kind,title,library,started_at,ended_at,watched_ms) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![id, user_id, username, item_id, kind, title, library, started_at, ended_at, watched_ms],
    )?;
    Ok(())
}

/// Per-user watch aggregates since `since` (unix-seconds), best watchers first.
pub fn top_users(pool: &Pool, since: i64, limit: usize) -> Result<Vec<kroma_domain::TopUser>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT COALESCE(username,'?') AS u, COUNT(*) AS plays, \
            SUM(watched_ms) AS total, \
            SUM(CASE WHEN kind='movie' THEN watched_ms ELSE 0 END) AS films, \
            SUM(CASE WHEN kind IN ('episode','video') THEN watched_ms ELSE 0 END) AS tv \
         FROM play_history WHERE ended_at >= ?1 \
         GROUP BY username ORDER BY total DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![since, limit as i64], |r| {
        Ok(kroma_domain::TopUser {
            username: r.get(0)?,
            plays: r.get(1)?,
            watched_ms: r.get::<_, Option<i64>>(2)?.unwrap_or(0),
            films_ms: r.get::<_, Option<i64>>(3)?.unwrap_or(0),
            tv_ms: r.get::<_, Option<i64>>(4)?.unwrap_or(0),
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Raw history rows since `since` (unix-seconds) for client/server-side bucketing.
pub fn history_since(pool: &Pool, since: i64) -> Result<Vec<kroma_domain::HistoryRow>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT ended_at,kind,watched_ms FROM play_history WHERE ended_at >= ?1 ORDER BY ended_at",
    )?;
    let rows = stmt.query_map(params![since], |r| {
        Ok(kroma_domain::HistoryRow {
            ended_at: r.get(0)?,
            kind: parse_kind(&r.get::<_, String>(1)?),
            watched_ms: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Per-library item count + total bytes on disk.
pub fn library_stats(pool: &Pool) -> Result<Vec<kroma_domain::LibraryStat>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT i.library, COUNT(DISTINCT i.id) AS items, COALESCE(SUM(f.size),0) AS bytes \
         FROM items i LEFT JOIN files f ON f.item_id = i.id \
         GROUP BY i.library",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(kroma_domain::LibraryStat {
            id: r.get(0)?,
            item_count: r.get(1)?,
            total_bytes: r.get::<_, Option<i64>>(2)?.unwrap_or(0),
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Total bytes across all indexed files (the "Utilisé" storage stat).
pub fn total_media_bytes(pool: &Pool) -> Result<i64> {
    let conn = pool.get()?;
    Ok(conn.query_row("SELECT COALESCE(SUM(size),0) FROM files", [], |r| r.get(0))?)
}

/// Counts for the cache panel: `(enriched items, enriched shows, embeddings)`
/// how many movies/videos and shows carry resolved TMDB metadata, and how many
/// title embeddings are stored.
pub fn metadata_counts(pool: &Pool) -> Result<(i64, i64, i64)> {
    let conn = pool.get()?;
    // Episodes also carry metadata but aren't "titles"; exclude them so the
    // count matches the movie/loose-video figure the panel documents.
    let items: i64 = conn.query_row(
        "SELECT COUNT(*) FROM items WHERE metadata IS NOT NULL AND kind != 'episode'",
        [],
        |r| r.get(0),
    )?;
    let shows: i64 =
        conn.query_row("SELECT COUNT(*) FROM shows WHERE metadata IS NOT NULL", [], |r| r.get(0))?;
    let vectors: i64 = conn.query_row("SELECT COUNT(*) FROM item_vectors", [], |r| r.get(0))?;
    Ok((items, shows, vectors))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;
    use kroma_domain::Permission;

    fn pool() -> TempPool {
        crate::testing::temp_pool("admin")
    }

    #[test]
    fn settings_upsert_and_readback() {
        let p = pool();
        assert!(settings_all(&p).unwrap().is_empty());
        settings_set(&p, "serverName", &serde_json::json!("My KROMA")).unwrap();
        settings_set(&p, "maxConcurrent", &serde_json::json!(3)).unwrap();
        settings_set(&p, "serverName", &serde_json::json!("Renamed")).unwrap();
        let all: std::collections::HashMap<String, serde_json::Value> =
            settings_all(&p).unwrap().into_iter().collect();
        assert_eq!(all.len(), 2);
        assert_eq!(all["serverName"], serde_json::json!("Renamed"));
        assert_eq!(all["maxConcurrent"], serde_json::json!(3));
    }

    #[test]
    fn admin_users_roles_and_mutations() {
        let p = pool();
        let owner = crate::create_user(&p, "o@b.c", "owner", "h", &Permission::all()).unwrap();
        let member = crate::create_user(&p, "m@b.c", "member", "h", &[Permission::Playback]).unwrap();

        let admins = admin_users(&p).unwrap();
        assert_eq!(admins.len(), 2);
        let owner_row = admins.iter().find(|u| u.id == owner.id).unwrap();
        let member_row = admins.iter().find(|u| u.id == member.id).unwrap();
        assert_eq!(owner_row.role, "Propriétaire");
        assert_eq!(member_row.role, "Membre");
        assert!(!owner_row.online);
        assert!(owner_row.last_seen.is_none());

        assert_eq!(get_user(&p, &member.id).unwrap().unwrap().username, "member");
        assert!(get_user(&p, "missing").unwrap().is_none());
        update_user_permissions(&p, &member.id, &[Permission::Playback, Permission::RequestsCreate]).unwrap();
        assert!(get_user(&p, &member.id).unwrap().unwrap().can(Permission::RequestsCreate));
        set_user_username(&p, &member.id, "renamed").unwrap();
        assert_eq!(get_user(&p, &member.id).unwrap().unwrap().username, "renamed");
        touch_last_seen(&p, &member.id).unwrap();
        let after = admin_users(&p).unwrap();
        assert!(after.iter().find(|u| u.id == member.id).unwrap().last_seen.is_some());

        delete_user(&p, &member.id).unwrap();
        assert_eq!(admin_users(&p).unwrap().len(), 1);
    }

    #[test]
    fn play_history_aggregates() {
        let p = pool();
        record_play(&p, Some("u1"), Some("alice"), Some("m1"), "movie", "Dune", Some("lib"), 0, 100, 60_000).unwrap();
        record_play(&p, Some("u1"), Some("alice"), Some("m2"), "episode", "Ep", Some("lib"), 0, 200, 30_000).unwrap();
        record_play(&p, Some("u2"), Some("bob"), Some("m1"), "movie", "Dune", Some("lib"), 0, 150, 10_000).unwrap();

        let top = top_users(&p, 0, 10).unwrap();
        assert_eq!(top.len(), 2);
        // alice watched 90s total > bob's 10s, so she ranks first.
        assert_eq!(top[0].username, "alice");
        assert_eq!(top[0].plays, 2);
        assert_eq!(top[0].watched_ms, 90_000);
        assert_eq!(top[0].films_ms, 60_000);
        assert_eq!(top[0].tv_ms, 30_000);

        // The `since` gate excludes older rows.
        assert!(top_users(&p, 1000, 10).unwrap().is_empty());
        assert_eq!(history_since(&p, 0).unwrap().len(), 3);
        assert!(history_since(&p, 1000).unwrap().is_empty());
    }

    #[test]
    fn library_and_metadata_stats() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')", []).unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
                 VALUES ('m1','movie','Dune','mkv','lib','t','{\"tmdbId\":1}')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m2','movie','U','mkv','lib','t')",
                [],
            )
            .unwrap();
            conn.execute("INSERT INTO files (id,item_id,abs_path,size) VALUES ('f1','m1','/a',1500)", []).unwrap();
            conn.execute("INSERT INTO files (id,item_id,abs_path,size) VALUES ('f2','m1','/b',500)", []).unwrap();
            conn.execute("INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('s1','lib','S','t','{\"tmdbId\":2}')", []).unwrap();
            conn.execute("INSERT INTO item_vectors (id,dim,vec,updated_at) VALUES ('m1',2,x'0000','t')", []).unwrap();
        }
        let stats = library_stats(&p).unwrap();
        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].id, "lib");
        assert_eq!(stats[0].item_count, 2);
        assert_eq!(stats[0].total_bytes, 2000);
        assert_eq!(total_media_bytes(&p).unwrap(), 2000);
        // 1 enriched movie, 1 enriched show, 1 embedding.
        assert_eq!(metadata_counts(&p).unwrap(), (1, 1, 1));
    }
}
