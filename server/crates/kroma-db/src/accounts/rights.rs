use super::*;

/// Adds `perm` to every account holding one of `equivalent` and not already
/// holding `perm` itself, and answers how many rows moved.
///
/// A row whose stored array is not valid JSON is left alone. An empty
/// `equivalent` grants nothing.
pub fn grant_to_accounts_holding(
    pool: &Pool,
    perm: Permission,
    equivalent: &[Permission],
) -> Result<usize> {
    if equivalent.is_empty() {
        return Ok(0);
    }
    let held = (2..=equivalent.len() + 1)
        .map(|i| format!("?{i}"))
        .collect::<Vec<_>>()
        .join(",");
    let mut keys = Vec::with_capacity(equivalent.len() + 1);
    keys.push(perm.key());
    keys.extend(equivalent.iter().map(|p| p.key()));
    let conn = pool.get()?;
    Ok(conn.execute(
        &format!(
            "UPDATE users SET permissions = json_insert(permissions, '$[#]', ?1) \
             WHERE json_valid(permissions) \
               AND NOT EXISTS (SELECT 1 FROM json_each(users.permissions) WHERE value = ?1) \
               AND EXISTS (SELECT 1 FROM json_each(users.permissions) WHERE value IN ({held}))"
        ),
        rusqlite::params_from_iter(keys),
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::{mk_user, pool};

    fn rights_of(pool: &Pool, id: &str) -> Vec<Permission> {
        crate::get_user(pool, id)
            .unwrap()
            .expect("the account")
            .permissions
    }

    fn grant_watchable(pool: &Pool) -> usize {
        grant_to_accounts_holding(pool, Permission::WatchablePlay, &[Permission::Playback]).unwrap()
    }

    #[test]
    fn an_account_holding_an_equivalent_right_is_granted_the_new_one() {
        let pool = pool();
        let alice = mk_user(&pool, "a@b.c", "alice");

        let moved = grant_watchable(&pool);

        assert_eq!(moved, 1);
        assert_eq!(
            rights_of(&pool, &alice.id),
            vec![Permission::Playback, Permission::WatchablePlay]
        );
    }

    #[test]
    fn an_account_holding_none_of_the_equivalent_rights_is_left_alone() {
        let pool = pool();
        let alice = mk_user(&pool, "a@b.c", "alice");

        let moved = grant_to_accounts_holding(
            &pool,
            Permission::WatchablePlay,
            &[Permission::RequestsAuto],
        )
        .unwrap();

        assert_eq!(moved, 0);
        assert_eq!(rights_of(&pool, &alice.id), vec![Permission::Playback]);
    }

    #[test]
    fn a_right_nothing_is_equal_to_reaches_nobody() {
        let pool = pool();
        let alice = mk_user(&pool, "a@b.c", "alice");

        let moved = grant_to_accounts_holding(&pool, Permission::WatchablePlay, &[]).unwrap();

        assert_eq!(moved, 0);
        assert_eq!(rights_of(&pool, &alice.id), vec![Permission::Playback]);
    }

    #[test]
    fn an_account_already_holding_the_right_keeps_one_copy_of_it() {
        let pool = pool();
        let alice = mk_user(&pool, "a@b.c", "alice");
        grant_watchable(&pool);

        let moved = grant_watchable(&pool);

        assert_eq!(moved, 0);
        assert_eq!(
            rights_of(&pool, &alice.id),
            vec![Permission::Playback, Permission::WatchablePlay]
        );
    }

    #[test]
    fn a_row_whose_rights_are_unreadable_does_not_stop_the_others() {
        let pool = pool();
        let alice = mk_user(&pool, "a@b.c", "alice");
        let broken = mk_user(&pool, "b@b.c", "bob");
        pool.get()
            .unwrap()
            .execute(
                "UPDATE users SET permissions = 'not json' WHERE id = ?1",
                params![broken.id],
            )
            .unwrap();

        let moved = grant_watchable(&pool);

        assert_eq!(moved, 1);
        assert!(rights_of(&pool, &alice.id).contains(&Permission::WatchablePlay));
    }
}
