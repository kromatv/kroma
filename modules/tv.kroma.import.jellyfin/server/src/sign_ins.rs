use anyhow::Result;
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::primitives::{now_ms, random_token};

/// The importer's own database: this installation's device, and each sign-in
/// it keeps.
pub const MIGRATIONS: &str = "
CREATE TABLE IF NOT EXISTS installation (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    device TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sign_ins (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    server_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL,
    device TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
";

// No `Debug`: this holds the token.
pub(crate) struct SignIn {
    pub(crate) id: String,
    pub(crate) address: String,
    pub(crate) server: String,
    pub(crate) user: String,
    pub(crate) token: String,
    pub(crate) device: String,
}

pub(crate) fn installation(store: &Pool) -> Result<String> {
    let conn = store.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO installation (id, device) VALUES (1, ?1)",
        [random_token()],
    )?;
    Ok(
        conn.query_row("SELECT device FROM installation WHERE id = 1", (), |row| {
            row.get(0)
        })?,
    )
}

pub(crate) fn keep(store: &Pool, sign_in: &SignIn) -> Result<()> {
    let conn = store.get()?;
    // Jellyfin deletes the token it gave this device and account before, so
    // an older sign-in of the same account no longer opens anything.
    conn.execute(
        "DELETE FROM sign_ins WHERE server_id = ?1 AND user_id = ?2",
        [&sign_in.server, &sign_in.user],
    )?;
    conn.execute(
        "INSERT INTO sign_ins (id, address, server_id, user_id, token, device, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            &sign_in.id,
            &sign_in.address,
            &sign_in.server,
            &sign_in.user,
            &sign_in.token,
            &sign_in.device,
            now_ms() / 1000,
        ),
    )?;
    Ok(())
}

pub(crate) fn find(store: &Pool, id: &str) -> Result<Option<SignIn>> {
    let conn = store.get()?;
    let mut statement = conn.prepare(
        "SELECT id, address, server_id, user_id, token, device FROM sign_ins WHERE id = ?1",
    )?;
    let mut found = statement.query_map([id], |row| {
        Ok(SignIn {
            id: row.get(0)?,
            address: row.get(1)?,
            server: row.get(2)?,
            user: row.get(3)?,
            token: row.get(4)?,
            device: row.get(5)?,
        })
    })?;
    Ok(found.next().transpose()?)
}

pub(crate) fn forget(store: &Pool, id: &str) -> Result<()> {
    store
        .get()?
        .execute("DELETE FROM sign_ins WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::test_support::store;

    fn sign_in(id: &str, user: &str) -> SignIn {
        SignIn {
            id: id.to_string(),
            address: "http://jellyfin.test:8096".to_string(),
            server: "srv".to_string(),
            user: user.to_string(),
            token: random_token(),
            device: "device".to_string(),
        }
    }

    #[test]
    fn a_kept_sign_in_is_found_again_by_its_id() {
        let store = store();
        let kept = sign_in("s-1", "ana");

        keep(&store, &kept).unwrap();
        let found = find(&store, "s-1").unwrap().unwrap();

        assert_eq!(found.token, kept.token);
        assert_eq!(found.address, kept.address);
    }

    #[test]
    fn a_new_sign_in_of_one_account_replaces_the_older_one() {
        let store = store();
        keep(&store, &sign_in("s-1", "ana")).unwrap();
        keep(&store, &sign_in("other", "leo")).unwrap();

        keep(&store, &sign_in("s-2", "ana")).unwrap();

        assert!(find(&store, "s-1").unwrap().is_none());
        assert!(find(&store, "s-2").unwrap().is_some());
        assert!(find(&store, "other").unwrap().is_some());
    }

    #[test]
    fn a_forgotten_sign_in_is_gone_and_forgetting_it_twice_is_no_error() {
        let store = store();
        keep(&store, &sign_in("s-1", "ana")).unwrap();

        forget(&store, "s-1").unwrap();
        let again = forget(&store, "s-1");

        assert!(find(&store, "s-1").unwrap().is_none());
        assert!(again.is_ok());
    }

    #[test]
    fn the_installation_keeps_one_name_for_itself() {
        let store = store();

        let first = installation(&store).unwrap();
        let second = installation(&store).unwrap();

        assert_eq!(first, second);
        assert_eq!(first.len(), 64);
    }
}
