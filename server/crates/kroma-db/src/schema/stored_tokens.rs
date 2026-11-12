//! Step 0013: the bearers stored before it become their SHA-256, the form every
//! lookup has used since, so each signed-in device stays signed in.

use rusqlite::{params, Connection};

pub(super) fn hash_bearers(conn: &Connection) -> rusqlite::Result<()> {
    for token in column(conn, "SELECT token FROM access_tokens")? {
        conn.execute(
            "UPDATE access_tokens SET token = ?2 WHERE token = ?1",
            params![token, kroma_primitives::sha256_hex(&token)],
        )?;
    }
    let mut stmt = conn.prepare("SELECT token, access_token FROM sessions")?;
    let sessions = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (token, access) in sessions {
        conn.execute(
            "UPDATE sessions SET token = ?2, access_token = ?3 WHERE token = ?1",
            params![
                token,
                kroma_primitives::sha256_hex(&token),
                access.as_deref().map(kroma_primitives::sha256_hex)
            ],
        )?;
    }
    Ok(())
}

fn column(conn: &Connection, sql: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |r| r.get(0))?;
    rows.collect()
}

#[cfg(test)]
mod tests;
