//! What a verified identity gets for the invitation it came in with: a new
//! account, or the one that waited on that invitation (ACCT-96, ACCT-98).

use anyhow::Result;
use kroma_domain::LibraryScope;

use super::{create, Identity, Outcome, Refusal};
use crate::db::{self, Pool};

pub(super) fn waiting_account(pool: &Pool, invite: Option<&str>) -> Result<Option<String>> {
    let Some(token) = invite else {
        return Ok(None);
    };
    Ok(db::invitee(pool, token)?.map(|invitee| invitee.user_id))
}

pub(super) fn join(pool: &Pool, identity: &Identity, email: &str, invite: &str) -> Result<Outcome> {
    match db::consume_invite(pool, invite)? {
        Some(permissions) => create(pool, identity, email, &permissions, &LibraryScope::All),
        None => Ok(Outcome::Refused(Refusal::InviteInvalid)),
    }
}

pub(super) fn claim(
    pool: &Pool,
    identity: &Identity,
    email: &str,
    invite: &str,
) -> Result<Outcome> {
    let label = identity.person.label();
    let brought = db::Claim {
        email,
        username: None,
        credential: db::Credential::Identity(&identity.stored(&label)),
    };
    let Some(user) = db::claim_account(pool, invite, &brought)? else {
        return Ok(Outcome::Refused(Refusal::InviteInvalid));
    };
    db::settle_join_request(pool, &identity.issuer, &identity.person.subject)?;
    Ok(Outcome::SignedIn {
        user_id: user.id,
        created: true,
    })
}

#[cfg(test)]
mod tests;
