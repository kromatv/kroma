//! Step 0020: an account may wait on an invitation, so its address becomes
//! optional and an invitation can name the account it gives a credential to.

use rusqlite::Connection;

const USERNAME_INDEX: &str = "idx_users_username";

pub(super) fn rebuild_users(conn: &Connection) -> rusqlite::Result<()> {
    let names_were_unique = index_exists(conn, USERNAME_INDEX)?;
    conn.execute_batch(include_str!("steps/0020_waiting_accounts.sql"))?;
    if names_were_unique {
        conn.execute_batch(&format!(
            "CREATE UNIQUE INDEX {USERNAME_INDEX} ON users(username)"
        ))?;
    }
    Ok(())
}

fn index_exists(conn: &Connection, name: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'index' AND name = ?1)",
        [name],
        |r| r.get(0),
    )
}

#[cfg(test)]
mod tests;
