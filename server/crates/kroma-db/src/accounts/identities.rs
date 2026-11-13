//! Provider identities: the (issuer, subject) pairs an account can sign in as.

use anyhow::Result;
use rusqlite::{params, OptionalExtension, TransactionBehavior};

use kroma_domain::{LibraryScope, Permission, User};

use super::{minted_user, permissions_json};
use crate::rows::row_to_user;
use crate::{now_or_blank, Pool};

pub struct IdentityRow {
    pub id: String,
    pub issuer: String,
    pub label: String,
    pub created_at: String,
    pub last_used: Option<String>,
}

/// What an account being created through a provider starts with.
pub struct NewMember<'a> {
    pub email: &'a str,
    pub username: &'a str,
    pub permissions: &'a [Permission],
    pub libraries: &'a LibraryScope,
}

/// One person at one provider, and the name they are shown under.
pub struct ProviderIdentity<'a> {
    pub issuer: &'a str,
    pub subject: &'a str,
    pub label: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkedIdentity {
    pub id: String,
    pub issuer: String,
}

/// The ways an account has left to prove itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignInMeans {
    pub password: bool,
    pub passkeys: i64,
    pub identities: Vec<LinkedIdentity>,
}

fn identity_id() -> String {
    kroma_primitives::short_hash(&format!("identity|{}", kroma_primitives::random_token()))
}

/// Whether the pair was free. `false` means it already belongs to an account,
/// this one or another, and nothing was written.
pub fn link_identity(pool: &Pool, user_id: &str, identity: &ProviderIdentity) -> Result<bool> {
    let conn = pool.get()?;
    let written = conn.execute(
        "INSERT OR IGNORE INTO identities (id,user_id,issuer,subject,label,created_at,last_used) \
         VALUES (?1,?2,?3,?4,?5,?6,NULL)",
        params![
            identity_id(),
            user_id,
            identity.issuer,
            identity.subject,
            identity.label,
            now_or_blank()
        ],
    )?;
    Ok(written == 1)
}

/// The account a provider identity signs in as, stamping the identity used.
pub fn identity_user(pool: &Pool, issuer: &str, subject: &str) -> Result<Option<User>> {
    let conn = pool.get()?;
    let user = conn
        .query_row(
            "SELECT u.id,u.email,u.username,u.avatar_url,u.created_at,u.permissions,u.language,\
             (u.pin_hash IS NOT NULL),u.audio_language,u.subtitle_language,u.libraries \
             FROM identities i JOIN users u ON u.id = i.user_id \
             WHERE i.issuer = ?1 AND i.subject = ?2",
            params![issuer, subject],
            row_to_user,
        )
        .optional()?;
    if user.is_some() {
        conn.execute(
            "UPDATE identities SET last_used = ?3 WHERE issuer = ?1 AND subject = ?2",
            params![issuer, subject, now_or_blank()],
        )?;
    }
    Ok(user)
}

/// Newest first.
pub fn list_identities(pool: &Pool, user_id: &str) -> Result<Vec<IdentityRow>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,issuer,label,created_at,last_used FROM identities \
         WHERE user_id = ?1 ORDER BY created_at DESC, rowid DESC",
    )?;
    let rows = stmt.query_map(params![user_id], |r| {
        Ok(IdentityRow {
            id: r.get(0)?,
            issuer: r.get(1)?,
            label: r.get(2)?,
            created_at: r.get(3)?,
            last_used: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Whether the identity was one of the account's own.
pub fn unlink_identity(pool: &Pool, user_id: &str, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let removed = conn.execute(
        "DELETE FROM identities WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
    )?;
    Ok(removed == 1)
}

pub fn sign_in_means(pool: &Pool, user_id: &str) -> Result<SignInMeans> {
    let conn = pool.get()?;
    let (password, passkeys) = conn.query_row(
        "SELECT (SELECT password_hash <> '' FROM users WHERE id = ?1),\
         (SELECT COUNT(*) FROM passkeys WHERE user_id = ?1)",
        params![user_id],
        |r| Ok((r.get::<_, Option<bool>>(0)?.unwrap_or(false), r.get(1)?)),
    )?;
    let mut stmt = conn.prepare("SELECT id,issuer FROM identities WHERE user_id = ?1")?;
    let identities = stmt
        .query_map(params![user_id], |r| {
            Ok(LinkedIdentity {
                id: r.get(0)?,
                issuer: r.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(SignInMeans {
        password,
        passkeys,
        identities,
    })
}

/// An account that has no password and signs in as `identity`, written with its
/// link in one transaction. `None` when the identity already belongs to an
/// account; a taken email is the `UNIQUE` error the caller pre-checks for.
pub fn create_member_with_identity(
    pool: &Pool,
    member: &NewMember,
    identity: &ProviderIdentity,
) -> Result<Option<User>> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let taken: bool = tx.query_row(
        "SELECT EXISTS (SELECT 1 FROM identities WHERE issuer = ?1 AND subject = ?2)",
        params![identity.issuer, identity.subject],
        |r| r.get(0),
    )?;
    if taken {
        return Ok(None);
    }
    let mut user = minted_user(member.email, member.username, member.permissions);
    user.libraries = member.libraries.clone();
    let libraries: Option<String> = match member.libraries {
        LibraryScope::All => None,
        LibraryScope::Only(ids) => Some(serde_json::to_string(ids)?),
    };
    tx.execute(
        "INSERT INTO users (id,email,username,password_hash,avatar_url,permissions,created_at,libraries) \
         VALUES (?1,?2,?3,'',NULL,?4,?5,?6)",
        params![
            user.id,
            user.email,
            user.username,
            permissions_json(&user.permissions),
            user.created_at,
            libraries
        ],
    )?;
    tx.execute(
        "INSERT INTO identities (id,user_id,issuer,subject,label,created_at,last_used) \
         VALUES (?1,?2,?3,?4,?5,?6,?6)",
        params![
            identity_id(),
            user.id,
            identity.issuer,
            identity.subject,
            identity.label,
            user.created_at
        ],
    )?;
    tx.commit()?;
    Ok(Some(user))
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{mk_user, pool};
    use super::*;

    const ISSUER: &str = "https://id.test";

    fn lea() -> ProviderIdentity<'static> {
        ProviderIdentity {
            issuer: ISSUER,
            subject: "sub-lea",
            label: "lea@id.test",
        }
    }

    fn newcomer<'a>(libraries: &'a LibraryScope) -> NewMember<'a> {
        NewMember {
            email: "lea@id.test",
            username: "lea",
            permissions: &[Permission::Playback],
            libraries,
        }
    }

    #[test]
    fn a_linked_identity_signs_in_as_its_account_and_is_stamped_used() {
        let p = pool();
        let user = mk_user(&p, "lea@test.dev", "lea");

        assert!(link_identity(&p, &user.id, &lea()).unwrap());
        let found = identity_user(&p, ISSUER, "sub-lea").unwrap();

        assert_eq!(found.map(|u| u.id), Some(user.id.clone()));
        let listed = list_identities(&p, &user.id).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].label, "lea@id.test");
        assert!(listed[0].last_used.is_some());
    }

    #[test]
    fn an_identity_belongs_to_one_account_only() {
        let p = pool();
        let first = mk_user(&p, "a@test.dev", "a");
        let second = mk_user(&p, "b@test.dev", "b");
        link_identity(&p, &first.id, &lea()).unwrap();

        let again = link_identity(&p, &second.id, &lea()).unwrap();

        assert!(!again);
        assert!(list_identities(&p, &second.id).unwrap().is_empty());
    }

    #[test]
    fn the_same_subject_at_another_issuer_is_another_person() {
        let p = pool();
        let user = mk_user(&p, "a@test.dev", "a");
        link_identity(&p, &user.id, &lea()).unwrap();

        let elsewhere = identity_user(&p, "https://other.test", "sub-lea").unwrap();

        assert!(elsewhere.is_none());
    }

    #[test]
    fn unlinking_takes_only_the_accounts_own_identity() {
        let p = pool();
        let owner = mk_user(&p, "a@test.dev", "a");
        let stranger = mk_user(&p, "b@test.dev", "b");
        link_identity(&p, &owner.id, &lea()).unwrap();
        let id = list_identities(&p, &owner.id).unwrap().remove(0).id;

        assert!(!unlink_identity(&p, &stranger.id, &id).unwrap());
        assert!(unlink_identity(&p, &owner.id, &id).unwrap());

        assert!(identity_user(&p, ISSUER, "sub-lea").unwrap().is_none());
    }

    #[test]
    fn a_member_created_through_a_provider_has_no_password_and_one_identity() {
        let p = pool();
        let films = LibraryScope::Only(vec!["films".into()]);

        let user = create_member_with_identity(&p, &newcomer(&films), &lea())
            .unwrap()
            .expect("a new account");

        assert_eq!(user.libraries, films);
        let means = sign_in_means(&p, &user.id).unwrap();
        assert_eq!((means.password, means.passkeys), (false, 0));
        assert_eq!(means.identities.len(), 1);
        assert_eq!(means.identities[0].issuer, ISSUER);
        let found = identity_user(&p, ISSUER, "sub-lea").unwrap().unwrap();
        assert_eq!(found.libraries, films);
    }

    #[test]
    fn an_identity_already_linked_creates_no_second_account() {
        let p = pool();
        let user = mk_user(&p, "a@test.dev", "a");
        link_identity(&p, &user.id, &lea()).unwrap();

        let created =
            create_member_with_identity(&p, &newcomer(&LibraryScope::All), &lea()).unwrap();

        assert!(created.is_none());
        assert_eq!(crate::user_count(&p).unwrap(), 1);
    }

    #[test]
    fn a_taken_email_fails_and_leaves_no_identity_behind() {
        let p = pool();
        mk_user(&p, "lea@id.test", "someone");

        let created = create_member_with_identity(&p, &newcomer(&LibraryScope::All), &lea());

        assert!(created.is_err());
        assert!(identity_user(&p, ISSUER, "sub-lea").unwrap().is_none());
    }

    #[test]
    fn an_account_with_a_password_counts_it_among_its_means() {
        let p = pool();
        let user = mk_user(&p, "a@test.dev", "a");

        let means = sign_in_means(&p, &user.id).unwrap();

        assert!(means.password);
        assert_eq!(means.passkeys, 0);
        assert!(means.identities.is_empty());
    }

    #[test]
    fn deleting_an_account_takes_its_identities_with_it() {
        let p = pool();
        let user = mk_user(&p, "a@test.dev", "a");
        link_identity(&p, &user.id, &lea()).unwrap();

        p.get()
            .unwrap()
            .execute("DELETE FROM users WHERE id = ?1", params![user.id])
            .unwrap();

        assert!(identity_user(&p, ISSUER, "sub-lea").unwrap().is_none());
    }
}
