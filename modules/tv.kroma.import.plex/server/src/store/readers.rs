use anyhow::Result;
use kroma_module_sdk::db::Pool;

use super::ServerKey;

/// Replaces the tokens kept for one server's users with `readers`, each a user
/// id and that user's token for the server.
pub(crate) fn keep_readers(
    pool: &Pool,
    key: ServerKey<'_>,
    readers: &[(String, String)],
) -> Result<()> {
    let conn = pool.get()?;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM readers WHERE sign_in = ?1 AND server = ?2",
        (key.sign_in, key.server),
    )?;
    for (user, token) in readers {
        tx.execute(
            "INSERT OR REPLACE INTO readers (sign_in, server, user, token) VALUES (?1, ?2, ?3, ?4)",
            (key.sign_in, key.server, user, token),
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub(crate) fn reader_token(pool: &Pool, key: ServerKey<'_>, user: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let mut found = conn
        .prepare("SELECT token FROM readers WHERE sign_in = ?1 AND server = ?2 AND user = ?3")?
        .query_map((key.sign_in, key.server, user), |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;
    Ok(found.pop())
}

/// Keeps the token a PIN opened for one user of a server, as `(user, token)`.
/// A later [`keep_readers`] replaces the readers and leaves it, so the user
/// stays readable until the sign-in is forgotten.
pub(crate) fn keep_unlocked(pool: &Pool, key: ServerKey<'_>, opened: (&str, &str)) -> Result<()> {
    let conn = pool.get()?;
    let tx = conn.unchecked_transaction()?;
    for table in ["unlocked", "readers"] {
        tx.execute(
            &format!(
                "INSERT OR REPLACE INTO {table} (sign_in, server, user, token) VALUES (?1, ?2, ?3, ?4)"
            ),
            (key.sign_in, key.server, opened.0, opened.1),
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Every `(user, token)` a PIN opened on one server.
pub(crate) fn unlocked(pool: &Pool, key: ServerKey<'_>) -> Result<Vec<(String, String)>> {
    let conn = pool.get()?;
    let opened = conn
        .prepare(
            "SELECT user, token FROM unlocked WHERE sign_in = ?1 AND server = ?2 ORDER BY user",
        )?
        .query_map((key.sign_in, key.server), |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?
        .collect::<Result<Vec<(String, String)>, _>>()?;
    Ok(opened)
}
