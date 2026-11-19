//! A user of another server who gets an account here: the account, the record
//! of whose it is and its invitation are one write.

use kroma_domain::imports::Kind;
use rusqlite::TransactionBehavior;

use super::records::{Entry, Ledger, record_on};
use crate::accounts::{insert_waiting_account, replace_invitation};
use crate::{AccountInvite, Awaited, Pool, Result, WaitingAccount};

/// The invitation an import drafts for an account it creates. `expires_at` is
/// Unix seconds.
pub struct Draft<'a> {
    pub token: &'a str,
    pub created_by: &'a str,
    pub expires_at: i64,
}

/// One user of another server, by that server's id for them, and the account
/// they start with here.
pub struct Newcomer<'a> {
    pub server_id: &'a str,
    pub user_id: &'a str,
    pub import_id: &'a str,
    pub account: WaitingAccount<'a>,
    pub invitation: Option<Draft<'a>>,
}

/// Creates the account a newcomer waits in, records whose it is and drafts its
/// invitation, in one transaction. An import that stops right after therefore
/// finds the account in the record and makes no second one. The row is
/// recorded with no fingerprint, so the import's own record of it still writes.
///
/// A name or an address another account holds writes nothing.
pub fn admit(pool: &Pool, newcomer: &Newcomer<'_>) -> Result<Awaited> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let admitted = insert_waiting_account(&tx, &newcomer.account)?;
    let Awaited::Account(account) = &admitted else {
        return Ok(admitted);
    };
    let users = Ledger {
        server_id: newcomer.server_id,
        kind: Kind::User,
        scope: "",
    };
    let entry = Entry {
        id: newcomer.user_id,
        fingerprint: "",
        target: Some(&account.id),
    };
    record_on(&tx, &users, newcomer.import_id, &[entry])?;
    if let Some(draft) = &newcomer.invitation {
        let invite = AccountInvite {
            token: draft.token,
            user_id: &account.id,
            created_by: draft.created_by,
            expires_at: draft.expires_at,
        };
        replace_invitation(&tx, &invite)?;
    }
    tx.commit()?;
    Ok(admitted)
}
