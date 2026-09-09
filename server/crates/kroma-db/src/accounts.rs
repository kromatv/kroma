//! The user row: creating an account, finding one, and naming it.
//!
//! Re-exported flat here so the public `db::<item>` paths resolve unchanged:
//! [`invites`] holds the token an account is created against, [`preferences`]
//! what the user chose, [`credentials`] the password and PIN hashes,
//! [`sessions`] a signed-in session and [`access_tokens`] the device credential
//! behind it.

use super::*;

use rusqlite::OptionalExtension;

use kroma_domain::PublicUser;

mod access_tokens;
mod credentials;
mod invites;
mod preferences;
mod resets;
mod sessions;
mod verifications;

#[cfg(test)]
mod test_support;

pub use access_tokens::*;
pub use credentials::*;
pub use invites::*;
pub use preferences::*;
pub use resets::*;
pub use sessions::*;
pub use verifications::*;

/// The id is random rather than derived from the email, so it isn't guessable.
/// The caller should pre-check the email to surface a clean 409; the `UNIQUE`
/// constraint is the hard guard.
pub fn create_user(
    pool: &Pool,
    email: &str,
    username: &str,
    password_hash: &str,
    permissions: &[Permission],
) -> Result<User> {
    let conn = pool.get()?;
    let user = minted_user(email, username, permissions);
    conn.execute(
        "INSERT INTO users (id,email,username,password_hash,avatar_url,permissions,created_at) \
         VALUES (?1,?2,?3,?4,NULL,?5,?6)",
        params![
            user.id,
            user.email,
            user.username,
            password_hash,
            permissions_json(&user.permissions),
            user.created_at
        ],
    )?;
    Ok(user)
}

/// The owner of an empty server, with every permission: the emptiness test and
/// the grant are one statement, so two first registrations racing a fresh
/// database cannot both come out owner (ACCT-2).
///
/// `None` means another account got there first, which leaves this one an
/// ordinary signup needing an invite (ACCT-3). Nothing was written.
pub fn create_owner_if_first(
    pool: &Pool,
    email: &str,
    username: &str,
    password_hash: &str,
) -> Result<Option<User>> {
    let conn = pool.get()?;
    let user = minted_user(email, username, &Permission::all());
    let granted = conn.execute(
        "INSERT INTO users (id,email,username,password_hash,avatar_url,permissions,created_at) \
         SELECT ?1,?2,?3,?4,NULL,?5,?6 WHERE NOT EXISTS (SELECT 1 FROM users)",
        params![
            user.id,
            user.email,
            user.username,
            password_hash,
            permissions_json(&user.permissions),
            user.created_at
        ],
    )?;
    Ok((granted == 1).then_some(user))
}

fn minted_user(email: &str, username: &str, permissions: &[Permission]) -> User {
    User {
        id: kroma_primitives::short_hash(&format!(
            "user|{email}|{}",
            kroma_primitives::random_token()
        )),
        email: email.to_string(),
        username: username.to_string(),
        avatar_url: None,
        language: None,
        permissions: permissions.to_vec(),
        libraries: kroma_domain::LibraryScope::All,
        created_at: now_or_blank(),
        has_pin: false,
        audio_language: None,
        subtitle_language: None,
    }
}

fn permissions_json(permissions: &[Permission]) -> String {
    serde_json::to_string(permissions).unwrap_or_else(|_| "[\"playback\"]".into())
}

pub fn user_count(pool: &Pool) -> Result<i64> {
    let conn = pool.get()?;
    Ok(conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?)
}

/// Matches the email case-insensitively; the second tuple field is the stored
/// password hash.
pub fn find_user_by_email(pool: &Pool, email: &str) -> Result<Option<(User, String)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,email,username,avatar_url,created_at,permissions,language,(pin_hash IS NOT NULL),audio_language,subtitle_language,libraries,password_hash FROM users WHERE email = ?1",
    )?;
    let mut rows = stmt.query_map(params![email], |r| {
        Ok((row_to_user(r)?, r.get::<_, String>(11)?))
    })?;
    match rows.next() {
        Some(v) => Ok(Some(v?)),
        None => Ok(None),
    }
}

/// `identifier` is either an email (case-insensitive) or a username, so the
/// profile picker — which only knows usernames — can log in. The second tuple
/// field is the stored password hash.
pub fn find_user_by_login(pool: &Pool, identifier: &str) -> Result<Option<(User, String)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,email,username,avatar_url,created_at,permissions,language,(pin_hash IS NOT NULL),audio_language,subtitle_language,libraries,password_hash FROM users \
         WHERE email = ?1 COLLATE NOCASE OR username = ?1 LIMIT 1",
    )?;
    let mut rows = stmt.query_map(params![identifier], |r| {
        Ok((row_to_user(r)?, r.get::<_, String>(11)?))
    })?;
    match rows.next() {
        Some(v) => Ok(Some(v?)),
        None => Ok(None),
    }
}

pub fn user_by_id(pool: &Pool, id: &str) -> Result<Option<User>> {
    let conn = pool.get()?;
    let user = conn
        .query_row(
            "SELECT id,email,username,avatar_url,created_at,permissions,language,(pin_hash IS NOT NULL),audio_language,subtitle_language,libraries FROM users WHERE id = ?1",
            params![id],
            row_to_user,
        )
        .optional()?;
    Ok(user)
}

pub fn list_users(pool: &Pool) -> Result<Vec<PublicUser>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,username,avatar_url,(pin_hash IS NOT NULL) FROM users ORDER BY created_at",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(PublicUser {
            id: r.get(0)?,
            username: r.get(1)?,
            avatar_url: r.get(2)?,
            has_pin: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Checks the username column (case-sensitive, as username login resolves) AND
/// the email column (case-insensitive): a username equal to someone's email
/// would otherwise shadow that victim's email login through the
/// `email = ?1 OR username = ?1` in `find_user_by_login`. `exclude_id` skips the
/// caller's own row.
pub fn username_taken(pool: &Pool, username: &str, exclude_id: Option<&str>) -> Result<bool> {
    let conn = pool.get()?;
    let taken: i64 = match exclude_id {
        Some(id) => conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE (username = ?1 OR email = ?1 COLLATE NOCASE) AND id <> ?2)",
            params![username, id],
            |r| r.get(0),
        )?,
        None => conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE username = ?1 OR email = ?1 COLLATE NOCASE)",
            params![username],
            |r| r.get(0),
        )?,
    };
    Ok(taken != 0)
}

/// The caller must pre-check for a duplicate to surface a clean 409; the
/// `UNIQUE COLLATE NOCASE` constraint is the atomic backstop, so a `rusqlite`
/// error here is that collision. Changing the address clears its verified
/// state: the proof belongs to the mailbox, not the account (ADMIN-87).
pub fn set_user_email(pool: &Pool, user_id: &str, email: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET email = ?2, email_verified_at = NULL WHERE id = ?1",
        params![user_id, email],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;

    #[test]
    fn create_user_count_and_lookups() {
        let p = pool();
        assert_eq!(user_count(&p).unwrap(), 0);
        let u = create_user(
            &p,
            "Alice@Example.com",
            "alice",
            "pw-hash",
            &[Permission::Playback, Permission::UsersManage],
        )
        .unwrap();
        assert_eq!(user_count(&p).unwrap(), 1);
        assert!(!u.id.is_empty());
        assert_eq!(
            u.permissions,
            vec![Permission::Playback, Permission::UsersManage]
        );
        assert!(!u.has_pin);

        let (found, hash) = find_user_by_email(&p, "alice@example.com")
            .unwrap()
            .unwrap();
        assert_eq!(found.id, u.id);
        assert_eq!(hash, "pw-hash");
        assert!(find_user_by_email(&p, "nobody@x.com").unwrap().is_none());

        assert_eq!(
            find_user_by_login(&p, "ALICE@example.com")
                .unwrap()
                .unwrap()
                .0
                .id,
            u.id
        );
        assert_eq!(find_user_by_login(&p, "alice").unwrap().unwrap().0.id, u.id);
        assert!(find_user_by_login(&p, "ghost").unwrap().is_none());

        assert_eq!(user_by_id(&p, &u.id).unwrap().unwrap().username, "alice");
        assert!(user_by_id(&p, "missing").unwrap().is_none());
        let list = list_users(&p).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].username, "alice");
        assert!(!list[0].has_pin);
    }

    #[test]
    fn an_account_arriving_after_the_first_is_not_granted_owner() {
        let p = pool();

        let owner = create_owner_if_first(&p, "first@test.dev", "first", "hash")
            .unwrap()
            .expect("the empty server is granted");
        let latecomer = create_owner_if_first(&p, "second@test.dev", "second", "hash").unwrap();

        assert_eq!(owner.permissions, Permission::all());
        assert!(latecomer.is_none());
        assert_eq!(user_count(&p).unwrap(), 1);
    }

    #[test]
    fn threads_racing_one_empty_server_leave_a_single_owner() {
        const RACERS: usize = 8;
        let p = pool();
        let shared = Pool::clone(&p);
        let gate = std::sync::Arc::new(std::sync::Barrier::new(RACERS));

        let racers: Vec<_> = (0..RACERS)
            .map(|n| {
                let pool = Pool::clone(&shared);
                let gate = std::sync::Arc::clone(&gate);
                std::thread::spawn(move || {
                    gate.wait();
                    create_owner_if_first(
                        &pool,
                        &format!("racer{n}@test.dev"),
                        &format!("racer{n}"),
                        "hash",
                    )
                    .unwrap()
                })
            })
            .collect();
        let granted: Vec<User> = racers
            .into_iter()
            .filter_map(|racer| racer.join().expect("a racer finished"))
            .collect();

        assert_eq!(granted.len(), 1, "{granted:?}");
        assert_eq!(granted[0].permissions, Permission::all());
        assert_eq!(user_count(&p).unwrap(), 1);
    }

    #[test]
    fn username_taken_checks_username_and_email() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        assert!(username_taken(&p, "alice", None).unwrap());
        assert!(username_taken(&p, "a@b.c", None).unwrap());
        assert!(!username_taken(&p, "bob", None).unwrap());
        assert!(!username_taken(&p, "alice", Some(&u.id)).unwrap());
        assert!(username_taken(&p, "alice", Some("other-id")).unwrap());
    }

    #[test]
    fn a_name_check_that_cannot_read_the_table_refuses_rather_than_reporting_free() {
        let p = pool();
        p.get().unwrap().execute_batch("DROP TABLE users").unwrap();

        assert!(username_taken(&p, "alice", None).is_err());
        assert!(username_taken(&p, "alice", Some("u1")).is_err());
    }
}
