//! Admin console: settings store, member management, play history + analytics
//! and library/storage stats.

use super::*;

use rusqlite::OptionalExtension;

mod play_history;
mod stats;

#[cfg(test)]
mod test_support;

pub use play_history::*;
pub use stats::*;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::admin::test_support::*;

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
}
