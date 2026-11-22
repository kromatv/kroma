//! Kids profiles (ACCT-122 to ACCT-130): accounts an admin makes for a child,
//! with no password, no address of their own and no way to sign in. A device opens one
//! from its picker with a member's credential instead.

use rusqlite::OptionalExtension;

use super::{Pool, Result, params};

use kroma_domain::{LibraryScope, MaturityLevel, Permission, User};

/// What an admin gives a new Kids profile.
#[derive(Debug, Clone)]
pub struct NewKidsProfile<'a> {
    pub username: &'a str,
    pub level: MaturityLevel,
    pub libraries: &'a LibraryScope,
}

/// A Kids profile as a picker draws it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KidsProfile {
    pub id: String,
    pub username: String,
    pub avatar_url: Option<String>,
}

/// Stored in place of a password hash: no password verifies against it.
const NO_PASSWORD: &str = "!kids";

/// The address a Kids profile holds only because every account must: under
/// the `.invalid` name reserved by RFC 2606, so no mail is ever delivered to
/// it, and no sign-in looks a Kids profile up at all.
fn placeholder_address(id: &str) -> String {
    format!("kids-{id}@kroma.invalid")
}

/// Create the account with its level, marked as a Kids profile.
pub fn create_kids_profile(pool: &Pool, new: &NewKidsProfile<'_>) -> Result<User> {
    let id = kroma_primitives::short_hash(&format!("kids|{}", kroma_primitives::random_token()));
    pool.get()?.execute(
        "INSERT INTO users (id,email,username,password_hash,permissions,created_at,libraries,maturity,kids) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1)",
        params![
            id,
            placeholder_address(&id),
            new.username,
            NO_PASSWORD,
            serde_json::to_string(&[Permission::Playback])?,
            crate::now_or_blank(),
            crate::rows::stored_library_scope(new.libraries)?,
            i64::from(new.level.age()),
        ],
    )?;
    crate::user_by_id(pool, &id)?.ok_or_else(|| anyhow::anyhow!("the new Kids profile is gone"))
}

pub fn is_kids_profile(pool: &Pool, user_id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let found = conn
        .query_row(
            "SELECT 1 FROM users WHERE id = ?1 AND kids = 1",
            params![user_id],
            |r| r.get::<_, i64>(0),
        )
        .optional()?;
    Ok(found.is_some())
}

/// Every Kids profile on the server, oldest first.
pub fn kids_profiles(pool: &Pool) -> Result<Vec<KidsProfile>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, username, avatar_url FROM users WHERE kids = 1 ORDER BY created_at, id",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(KidsProfile {
            id: r.get(0)?,
            username: r.get(1)?,
            avatar_url: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests;
