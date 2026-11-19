//! Admin console: settings store, member management, play history + analytics
//! and library/storage stats.

use super::{now_or_blank, params, row_to_user, Permission, Pool, Result, Row, User};

use rusqlite::{Connection, OptionalExtension};

mod metrics;
mod play_history;
mod play_sort;
mod stats;
mod watch_stats;

#[cfg(test)]
mod test_support;

pub use metrics::*;
pub use play_history::*;
pub use play_sort::*;
pub use stats::*;
pub use watch_stats::*;

/// What the settings table holds: the rows that read as JSON, and the keys of
/// the rows that do not. A reader that answers a default for one of those keys
/// has not read what the owner saved.
#[derive(Debug, Default)]
pub struct StoredSettings {
    pub values: Vec<(String, serde_json::Value)>,
    pub unreadable: Vec<String>,
}

/// Every persisted setting.
pub fn settings_all(pool: &Pool) -> Result<StoredSettings> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT key,value FROM settings")?;
    let rows = stmt.query_map([], |r| {
        let k: String = r.get(0)?;
        let v: String = r.get(1)?;
        Ok((k, v))
    })?;
    let mut stored = StoredSettings::default();
    for row in rows {
        let (k, raw) = row?;
        match serde_json::from_str::<serde_json::Value>(&raw) {
            Ok(v) => stored.values.push((k, v)),
            Err(_) => stored.unreadable.push(k),
        }
    }
    Ok(stored)
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
/// playback registry. A reset request counts for [`RESET_REQUEST_FRESH_DAYS`],
/// then goes stale and stops showing. An account that waits on an invitation
/// says where that invitation stands.
pub fn admin_users(pool: &Pool) -> Result<Vec<kroma_domain::AdminUser>> {
    let conn = pool.get()?;
    let now = time::OffsetDateTime::now_utc();
    let cutoff = (now - time::Duration::days(RESET_REQUEST_FRESH_DAYS))
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default();
    let mut stmt = conn.prepare(
        "SELECT users.id,email,username,avatar_url,users.created_at,permissions,last_seen,(pin_hash IS NOT NULL),audio_language,subtitle_language,libraries,(email_verified_at IS NOT NULL),(rr.created_at IS NOT NULL),waiting,\
         (SELECT expires_at FROM invites WHERE user_id = users.id AND used_at IS NULL) \
         FROM users LEFT JOIN reset_requests rr ON rr.user_id = users.id AND rr.created_at > ?1 \
         ORDER BY users.created_at",
    )?;
    let rows = stmt.query_map([cutoff], |r| {
        let invitation = r
            .get::<_, bool>(13)?
            .then_some(r.get::<_, Option<i64>>(14)?)
            .map(|lapses| kroma_domain::InvitationState::at(lapses, now.unix_timestamp()));
        admin_user(row_to_admin_user(r)?, r, invitation)
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn admin_user(
    u: User,
    r: &Row,
    invitation: Option<kroma_domain::InvitationState>,
) -> rusqlite::Result<kroma_domain::AdminUser> {
    Ok(kroma_domain::AdminUser {
        role: kroma_domain::role_label(&u.permissions).to_string(),
        id: u.id,
        email: r.get(1)?,
        username: u.username,
        avatar_url: u.avatar_url,
        permissions: u.permissions,
        libraries: u.libraries,
        created_at: u.created_at,
        last_seen: r.get(6)?,
        online: false,
        email_verified: r.get(11)?,
        has_pin: u.has_pin,
        reset_requested: r.get(12)?,
        invitation,
    })
}

/// Days a sign-in-screen reset request stays on the member row before it is
/// treated as stale.
const RESET_REQUEST_FRESH_DAYS: i64 = 30;

/// Fetch one full user by id (with email + permissions), or `None`.
#[allow(dead_code)] // public lookup helper; used by admin tooling/tests.
pub fn get_user(pool: &Pool, id: &str) -> Result<Option<User>> {
    let conn = pool.get()?;
    let user = conn
        .query_row(
            "SELECT id,email,username,avatar_url,created_at,permissions,language,(pin_hash IS NOT NULL),audio_language,subtitle_language,libraries FROM users WHERE id = ?1",
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
    mark_last_seen(&*pool.get()?, id)
}

pub(crate) fn mark_last_seen(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE users SET last_seen = ?2 WHERE id = ?1",
        params![id, now_or_blank()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests;
