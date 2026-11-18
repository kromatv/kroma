//! An account that waits on an invitation: it exists before its person has
//! signed in, holds no credential, and its invitation is the only way into it
//! (ACCT-94 to ACCT-100).

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

use kroma_domain::{LibraryScope, Permission, User};

use super::identities::{sign_in_as, ProviderIdentity};
use super::taken::{address_in_use, name_in_use};
use super::{minted_user, permissions_json, user_by_id};
use crate::rows::stored_library_scope;
use crate::{now_or_blank, Pool};

/// What an account that waits starts with. A blank `email` is no address.
pub struct WaitingAccount<'a> {
    pub username: &'a str,
    pub email: Option<&'a str>,
    pub libraries: &'a LibraryScope,
}

#[derive(Debug, Clone)]
pub enum Awaited {
    Account(Box<User>),
    UsernameTaken,
    EmailTaken,
}

/// An account with a name, its library visibility and no credential, which
/// nobody can sign in to until its invitation is redeemed (ACCT-94). It starts
/// with playback alone. A name or an address another account holds writes
/// nothing.
pub fn create_waiting_account(pool: &Pool, account: &WaitingAccount) -> Result<Awaited> {
    let username = account.username.trim();
    anyhow::ensure!(!username.is_empty(), "an account that waits needs a name");
    let email = account
        .email
        .map(str::trim)
        .filter(|address| !address.is_empty());
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if name_in_use(&tx, username, None)? {
        return Ok(Awaited::UsernameTaken);
    }
    if let Some(address) = email {
        if address_in_use(&tx, address, None)? {
            return Ok(Awaited::EmailTaken);
        }
    }
    let mut user = minted_user(email.unwrap_or_default(), username, &[Permission::Playback]);
    user.libraries = account.libraries.clone();
    tx.execute(
        "INSERT INTO users \
         (id,email,username,password_hash,avatar_url,permissions,created_at,libraries,waiting) \
         VALUES (?1,?2,?3,'',NULL,?4,?5,?6,1)",
        params![
            user.id,
            email,
            user.username,
            permissions_json(&user.permissions),
            user.created_at,
            stored_library_scope(account.libraries)?
        ],
    )?;
    tx.commit()?;
    Ok(Awaited::Account(Box::new(user)))
}

/// Whether the account waits on an invitation. An unknown id does not.
pub fn account_waits(pool: &Pool, user_id: &str) -> Result<bool> {
    Ok(waits(&*pool.get()?, user_id)?)
}

fn waits(conn: &Connection, user_id: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = ?1 AND waiting = 1)",
        params![user_id],
        |r| r.get(0),
    )
}

/// A new invitation for an account that waits.
pub struct AccountInvite<'a> {
    pub token: &'a str,
    pub user_id: &'a str,
    pub created_by: &'a str,
    pub expires_at: i64,
}

/// Gives a waiting account a new invitation and voids the one before, so the
/// account has one way in at most (ACCT-100). `false` when `user_id` names no
/// account that waits; nothing was written.
pub fn invite_waiting_account(pool: &Pool, invite: &AccountInvite) -> Result<bool> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if !waits(&tx, invite.user_id)? {
        return Ok(false);
    }
    tx.execute(
        "DELETE FROM invites WHERE user_id = ?1 AND used_at IS NULL",
        params![invite.user_id],
    )?;
    tx.execute(
        "INSERT INTO invites (token,created_by,created_at,expires_at,used_at,user_id) \
         VALUES (?1,?2,?3,?4,NULL,?5)",
        params![
            invite.token,
            invite.created_by,
            now_or_blank(),
            invite.expires_at,
            invite.user_id
        ],
    )?;
    tx.commit()?;
    Ok(true)
}

/// The account a live invitation gives a credential to, as it waits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invitee {
    pub user_id: String,
    pub username: String,
    pub email: Option<String>,
}

/// `None` for an invitation that creates an account, and for one that is
/// unknown, used or expired.
pub fn invitee(pool: &Pool, token: &str) -> Result<Option<Invitee>> {
    let conn = pool.get()?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let found = conn
        .query_row(
            "SELECT u.id,u.username,u.email FROM invites i JOIN users u ON u.id = i.user_id \
             WHERE i.token = ?1 AND i.used_at IS NULL AND i.expires_at > ?2 AND u.waiting = 1",
            params![token, now],
            |r| {
                Ok(Invitee {
                    user_id: r.get(0)?,
                    username: r.get(1)?,
                    email: r.get(2)?,
                })
            },
        )
        .optional()?;
    Ok(found)
}

/// What gives a waiting account its way in.
pub enum Credential<'a> {
    PasswordHash(&'a str),
    Identity(&'a ProviderIdentity<'a>),
}

/// What the person redeeming a waiting account's invitation brings.
pub struct Claim<'a> {
    pub email: &'a str,
    /// `None` keeps the name the account waited under.
    pub username: Option<&'a str>,
    pub credential: Credential<'a>,
}

/// Spends the invitation of a waiting account and gives that account its
/// credential, in one transaction. The account keeps its id, so everything it
/// held is still its own (ACCT-98).
///
/// `None` when the token is not the live invitation of an account that waits;
/// nothing was written. A name or an address another account holds is the
/// `UNIQUE` error the caller pre-checks for, and it leaves the invitation
/// unspent.
pub fn claim_account(pool: &Pool, token: &str, claim: &Claim) -> Result<Option<User>> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(user_id) = spend(&tx, token)? else {
        return Ok(None);
    };
    let password_hash = match claim.credential {
        Credential::PasswordHash(hash) => hash,
        Credential::Identity(_) => "",
    };
    let claimed = tx.execute(
        "UPDATE users SET email = ?2, username = COALESCE(?3, username), password_hash = ?4, \
         waiting = 0 WHERE id = ?1 AND waiting = 1",
        params![user_id, claim.email, claim.username, password_hash],
    )?;
    if claimed == 0 {
        return Ok(None);
    }
    if let Credential::Identity(identity) = claim.credential {
        sign_in_as(&tx, &user_id, identity, &now_or_blank())?;
    }
    tx.commit()?;
    drop(conn);
    user_by_id(pool, &user_id)
}

fn spend(conn: &Connection, token: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "UPDATE invites SET used_at = ?2 \
         WHERE token = ?1 AND used_at IS NULL AND expires_at > ?3 AND user_id IS NOT NULL \
         RETURNING user_id",
        params![
            token,
            now_or_blank(),
            time::OffsetDateTime::now_utc().unix_timestamp()
        ],
        |r| r.get(0),
    )
    .optional()
}

#[cfg(test)]
mod doors;
#[cfg(test)]
mod tests;
