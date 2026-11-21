use anyhow::Result;
use kroma_module_sdk::db::{Pool, PooledConn};

use super::ServerKey;

pub(crate) struct SignIn {
    pub id: String,
    pub token: String,
    pub account_id: String,
}

pub(crate) struct Finished<'a> {
    pub pending: &'a str,
    pub sign_in: &'a SignIn,
    pub servers: &'a [ServerRow],
    pub now: i64,
}

/// One server of a sign-in. `address` is where plex.tv said it is, for the
/// owner to recognise it by. `route` is the address that last answered as this
/// server, and `None` until one has.
pub(crate) struct ServerRow {
    pub id: String,
    pub name: String,
    pub token: String,
    pub address: Option<String>,
    pub route: Option<String>,
}

/// Keeps a finished sign-in with the servers it reaches, and marks the pending
/// sign-in it came from, in one transaction.
pub(crate) fn keep_sign_in(pool: &Pool, finished: &Finished<'_>) -> Result<()> {
    let sign_in = finished.sign_in;
    let conn = pool.get()?;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO sign_ins (id, token, account_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        (
            &sign_in.id,
            &sign_in.token,
            &sign_in.account_id,
            finished.now,
        ),
    )?;
    for server in finished.servers {
        keep_server(&conn, &sign_in.id, server)?;
    }
    tx.execute(
        "UPDATE pending SET sign_in = ?1 WHERE id = ?2",
        (&sign_in.id, finished.pending),
    )?;
    tx.commit()?;
    Ok(())
}

fn keep_server(conn: &PooledConn, sign_in: &str, server: &ServerRow) -> Result<()> {
    conn.execute(
        "INSERT INTO servers (sign_in, id, name, token, address) VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            sign_in,
            &server.id,
            &server.name,
            &server.token,
            &server.address,
        ),
    )?;
    Ok(())
}

pub(crate) fn sign_in(pool: &Pool, id: &str) -> Result<Option<SignIn>> {
    let conn = pool.get()?;
    let mut found = conn
        .prepare("SELECT id, token, account_id FROM sign_ins WHERE id = ?1")?
        .query_map([id], |row| {
            Ok(SignIn {
                id: row.get(0)?,
                token: row.get(1)?,
                account_id: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(found.pop())
}

pub(crate) fn servers(pool: &Pool, sign_in: &str) -> Result<Vec<ServerRow>> {
    let conn = pool.get()?;
    let rows = conn
        .prepare(
            "SELECT id, name, token, address, route FROM servers
             WHERE sign_in = ?1 ORDER BY name, id",
        )?
        .query_map([sign_in], |row| {
            Ok(ServerRow {
                id: row.get(0)?,
                name: row.get(1)?,
                token: row.get(2)?,
                address: row.get(3)?,
                route: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub(crate) fn server(pool: &Pool, key: ServerKey<'_>) -> Result<Option<ServerRow>> {
    let mut all = servers(pool, key.sign_in)?;
    all.retain(|row| row.id == key.server);
    Ok(all.pop())
}

pub(crate) fn set_route(pool: &Pool, key: ServerKey<'_>, route: Option<&str>) -> Result<()> {
    pool.get()?.execute(
        "UPDATE servers SET route = ?1 WHERE sign_in = ?2 AND id = ?3",
        (route, key.sign_in, key.server),
    )?;
    Ok(())
}

/// Deletes a sign-in and everything kept under it. One that is not held is
/// forgotten already.
pub(crate) fn forget(pool: &Pool, sign_in: &str) -> Result<()> {
    let conn = pool.get()?;
    let tx = conn.unchecked_transaction()?;
    for table in ["unlocked", "readers", "servers", "pending"] {
        tx.execute(
            &format!("DELETE FROM {table} WHERE sign_in = ?1"),
            [sign_in],
        )?;
    }
    tx.execute("DELETE FROM sign_ins WHERE id = ?1", [sign_in])?;
    tx.commit()?;
    Ok(())
}
