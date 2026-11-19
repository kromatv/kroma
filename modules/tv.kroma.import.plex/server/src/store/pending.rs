use anyhow::Result;
use kroma_module_sdk::db::Pool;

/// A sign-in the owner has not finished on plex.tv yet, or has: `sign_in` then
/// names what it became, so asking again answers the same thing.
pub(crate) struct Pending {
    pub id: String,
    pub pin_id: i64,
    pub code: String,
    pub expires_at: i64,
    pub sign_in: Option<String>,
}

pub(crate) fn open_pending(pool: &Pool, pending: &Pending) -> Result<()> {
    pool.get()?.execute(
        "INSERT INTO pending (id, pin_id, code, expires_at) VALUES (?1, ?2, ?3, ?4)",
        (
            &pending.id,
            pending.pin_id,
            &pending.code,
            pending.expires_at,
        ),
    )?;
    Ok(())
}

pub(crate) fn pending(pool: &Pool, id: &str) -> Result<Option<Pending>> {
    let conn = pool.get()?;
    let mut found = conn
        .prepare("SELECT id, pin_id, code, expires_at, sign_in FROM pending WHERE id = ?1")?
        .query_map([id], |row| {
            Ok(Pending {
                id: row.get(0)?,
                pin_id: row.get(1)?,
                code: row.get(2)?,
                expires_at: row.get(3)?,
                sign_in: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(found.pop())
}

pub(crate) fn drop_pending(pool: &Pool, id: &str) -> Result<()> {
    pool.get()?
        .execute("DELETE FROM pending WHERE id = ?1", [id])?;
    Ok(())
}

pub(crate) fn sweep_pending(pool: &Pool, now: i64) -> Result<()> {
    pool.get()?
        .execute("DELETE FROM pending WHERE expires_at <= ?1", [now])?;
    Ok(())
}
