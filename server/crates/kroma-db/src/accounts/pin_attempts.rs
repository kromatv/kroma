//! The failed PIN guesses behind the profile-switch cooldown.

use anyhow::Result;
use rusqlite::{params, OptionalExtension};

use crate::Pool;

/// Where an account stands with the PIN gate: the wrong guesses on record, and
/// the unix second the cooldown they earned runs out (`0` = none). The caller
/// owns the clock and the policy; this is only what was written down.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct PinAttempts {
    pub fails: i64,
    pub locked_until: i64,
}

/// An account nobody has guessed at reads as [`PinAttempts::default`].
pub fn pin_attempts(pool: &Pool, user_id: &str) -> Result<PinAttempts> {
    let conn = pool.get()?;
    let recorded = conn
        .query_row(
            "SELECT fails, locked_until FROM pin_attempts WHERE user_id = ?1",
            params![user_id],
            read_attempts,
        )
        .optional()?;
    Ok(recorded.unwrap_or_default())
}

/// Counts one wrong guess, arming the cooldown until `locked_until` once the
/// count reaches `max_fails`, and answers with the account's standing after it.
///
/// One statement, so two guesses in flight cannot both read the same count and
/// write it back. A guess that arrives after a cooldown has run out counts on
/// top of the old ones and re-arms immediately.
pub fn record_pin_fail(
    pool: &Pool,
    user_id: &str,
    max_fails: i64,
    locked_until: i64,
) -> Result<PinAttempts> {
    let conn = pool.get()?;
    let recorded = conn.query_row(
        "INSERT INTO pin_attempts (user_id, fails, locked_until) \
         VALUES (?1, 1, CASE WHEN 1 >= ?3 THEN ?2 ELSE 0 END) \
         ON CONFLICT(user_id) DO UPDATE SET \
            fails = fails + 1, \
            locked_until = CASE WHEN fails + 1 >= ?3 THEN ?2 ELSE locked_until END \
         RETURNING fails, locked_until",
        params![user_id, locked_until, max_fails],
        read_attempts,
    )?;
    Ok(recorded)
}

pub fn clear_pin_attempts(pool: &Pool, user_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM pin_attempts WHERE user_id = ?1",
        params![user_id],
    )?;
    Ok(())
}

fn read_attempts(row: &rusqlite::Row) -> rusqlite::Result<PinAttempts> {
    Ok(PinAttempts {
        fails: row.get(0)?,
        locked_until: row.get(1)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;

    const MAX_FAILS: i64 = 5;
    const UNTIL: i64 = 9_999_999_999;

    #[test]
    fn an_account_nobody_has_guessed_at_has_nothing_on_record() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");

        assert_eq!(pin_attempts(&p, &u.id).unwrap(), PinAttempts::default());
        assert_eq!(pin_attempts(&p, "nobody").unwrap(), PinAttempts::default());
    }

    #[test]
    fn the_cooldown_arms_on_the_guess_that_reaches_the_limit() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");

        for expected in 1..MAX_FAILS {
            let recorded = record_pin_fail(&p, &u.id, MAX_FAILS, UNTIL).unwrap();
            assert_eq!(recorded.fails, expected);
            assert_eq!(recorded.locked_until, 0);
        }
        let tripped = record_pin_fail(&p, &u.id, MAX_FAILS, UNTIL).unwrap();

        assert_eq!(tripped.fails, MAX_FAILS);
        assert_eq!(tripped.locked_until, UNTIL);
        assert_eq!(pin_attempts(&p, &u.id).unwrap(), tripped);
    }

    #[test]
    fn a_guess_after_the_cooldown_ran_out_re_arms_it() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        for _ in 0..MAX_FAILS {
            record_pin_fail(&p, &u.id, MAX_FAILS, 1).unwrap();
        }

        let again = record_pin_fail(&p, &u.id, MAX_FAILS, UNTIL).unwrap();

        assert_eq!(again.fails, MAX_FAILS + 1);
        assert_eq!(again.locked_until, UNTIL);
    }

    #[test]
    fn clearing_the_record_gives_the_next_guess_the_whole_allowance_back() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        for _ in 0..MAX_FAILS {
            record_pin_fail(&p, &u.id, MAX_FAILS, UNTIL).unwrap();
        }

        clear_pin_attempts(&p, &u.id).unwrap();

        assert_eq!(pin_attempts(&p, &u.id).unwrap(), PinAttempts::default());
        let next = record_pin_fail(&p, &u.id, MAX_FAILS, UNTIL).unwrap();
        assert_eq!(next.fails, 1);
        assert_eq!(next.locked_until, 0);
    }

    #[test]
    fn a_cooldown_is_still_standing_when_the_database_is_opened_again() {
        let (first, dir) = pool().into_parts();
        let u = mk_user(&first, "a@b.c", "alice");
        for _ in 0..MAX_FAILS {
            record_pin_fail(&first, &u.id, MAX_FAILS, UNTIL).unwrap();
        }
        drop(first);

        let reopened = crate::init(&dir.path().join("kroma.db")).unwrap();

        let recorded = pin_attempts(&reopened, &u.id).unwrap();
        assert_eq!(recorded.fails, MAX_FAILS);
        assert_eq!(recorded.locked_until, UNTIL);
    }

    #[test]
    fn a_deleted_account_takes_its_guesses_with_it() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        record_pin_fail(&p, &u.id, MAX_FAILS, UNTIL).unwrap();

        p.get()
            .unwrap()
            .execute("DELETE FROM users WHERE id = ?1", params![u.id])
            .unwrap();

        assert_eq!(pin_attempts(&p, &u.id).unwrap(), PinAttempts::default());
    }
}
