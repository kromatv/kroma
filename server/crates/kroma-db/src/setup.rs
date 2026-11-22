//! Persistence for the guided setup: one row, written when the first account
//! is made. A server that had its owner before the setup existed has none.

use kroma_domain::setup::{Setup, Step};
use rusqlite::OptionalExtension;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use super::{Pool, Result, Row, params};

const COLS: &str = "owner, start, step, reached, ended, done, dismissed";

fn word<T: DeserializeOwned>(text: String) -> Option<T> {
    serde_json::from_value(Value::String(text)).ok()
}

fn name<T: Serialize>(value: T) -> String {
    match serde_json::to_value(value) {
        Ok(Value::String(name)) => name,
        _ => String::new(),
    }
}

fn list<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "[]".into())
}

fn row_to_setup(r: &Row) -> rusqlite::Result<Setup> {
    let ended: i64 = r.get(4)?;
    let done: String = r.get(5)?;
    let dismissed: String = r.get(6)?;
    Ok(Setup {
        owner: r.get(0)?,
        start: word(r.get(1)?).unwrap_or_default(),
        step: word(r.get(2)?).unwrap_or(Step::Owner),
        reached: word(r.get(3)?).unwrap_or(Step::Owner),
        ended: ended != 0,
        done: serde_json::from_str(&done).unwrap_or_default(),
        dismissed: serde_json::from_str(&dismissed).unwrap_or_default(),
    })
}

/// The setup, `None` on a server whose owner came before it.
pub fn setup(pool: &Pool) -> Result<Option<Setup>> {
    let conn = pool.get()?;
    let sql = format!("SELECT {COLS} FROM setup WHERE id = 1");
    Ok(conn.query_row(&sql, [], row_to_setup).optional()?)
}

/// Writes the setup, over the one already kept.
pub fn save_setup(pool: &Pool, setup: &Setup) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        &format!(
            "INSERT INTO setup (id, {COLS}) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7) \
             ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, start = excluded.start, \
             step = excluded.step, reached = excluded.reached, ended = excluded.ended, \
             done = excluded.done, dismissed = excluded.dismissed"
        ),
        params![
            setup.owner,
            name(setup.start),
            name(setup.step),
            name(setup.reached),
            i64::from(setup.ended),
            list(&setup.done),
            list(&setup.dismissed),
        ],
    )?;
    Ok(())
}

/// Starts the setup of the owner whose account was just made. A setup an
/// earlier owner left, on a server emptied since, gives way to it.
pub fn lead_setup(pool: &Pool, owner: &str) -> Result<()> {
    save_setup(pool, &Setup::led_by(owner))
}

#[cfg(test)]
mod tests {
    use kroma_domain::setup::{Facts, Start, Step};

    use super::*;
    use crate::testing::{TempPool, temp_pool};
    use kroma_domain::{Permission, User};

    fn test_pool() -> TempPool {
        temp_pool("setup")
    }

    fn mk_user(pool: &Pool, email: &str, username: &str) -> User {
        crate::create_user(pool, email, username, "hash", &[Permission::Playback]).unwrap()
    }

    #[test]
    fn a_server_whose_owner_came_before_the_setup_has_none() {
        let pool = test_pool();
        mk_user(&pool, "owner@test.dev", "owner");

        let kept = setup(&pool).unwrap();

        assert_eq!(kept, None);
    }

    #[test]
    fn a_setup_reads_back_as_it_was_written() {
        let pool = test_pool();
        let owner = mk_user(&pool, "owner@test.dev", "owner");
        let mut written = Setup::led_by(&owner.id);
        written.advance(Step::People, Start::Bring);
        written.ended = true;
        written.observe(Facts {
            source: true,
            ..Facts::default()
        });
        written.dismissed.insert(Step::Privacy);
        save_setup(&pool, &written).unwrap();

        let kept = setup(&pool).unwrap();

        assert_eq!(kept, Some(written));
    }

    #[test]
    fn a_new_owner_takes_over_the_setup_an_earlier_one_left() {
        let pool = test_pool();
        let first = mk_user(&pool, "first@test.dev", "first");
        let second = mk_user(&pool, "second@test.dev", "second");
        lead_setup(&pool, &first.id).unwrap();

        lead_setup(&pool, &second.id).unwrap();

        assert_eq!(setup(&pool).unwrap(), Some(Setup::led_by(&second.id)));
    }

    #[test]
    fn the_owner_leaving_the_server_leaves_a_setup_nobody_leads() {
        let pool = test_pool();
        let owner = mk_user(&pool, "owner@test.dev", "owner");
        lead_setup(&pool, &owner.id).unwrap();

        crate::delete_user(&pool, &owner.id).unwrap();

        assert_eq!(setup(&pool).unwrap().and_then(|kept| kept.owner), None);
    }
}
