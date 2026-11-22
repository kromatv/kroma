use anyhow::{bail, Result};

use crate::account::{is_plain, Account};
use crate::failure::Failure;
use crate::plex::Plex;
use crate::store::{self, ServerKey};
use crate::wire::{UnlockAsk, UnlockRefusal, Unlocked};

impl Plex {
    /// Switches to a Home user protected by a PIN and keeps the token that
    /// user holds for the server, so `survey` reports them as readable and
    /// `states` reads them. The PIN serves that one call and is kept nowhere.
    pub(crate) fn unlock(&self, ask: &UnlockAsk) -> Result<Unlocked> {
        let sign_in = self.signed_in(&ask.sign_in)?;
        let key = ServerKey {
            sign_in: &ask.sign_in,
            server: &ask.server,
        };
        if store::server(&self.store, key)?.is_none() {
            bail!("this sign-in reaches no such server");
        }
        let client = store::client_id(&self.store)?;
        match opened(&self.account(&client), &sign_in.token, ask) {
            Ok(token) => {
                store::keep_unlocked(&self.store, key, (&ask.user, &token))?;
                Ok(Unlocked::Unlocked)
            }
            Err(reason) => Ok(Unlocked::Refused { reason }),
        }
    }
}

fn opened(account: &Account<'_>, owner: &str, ask: &UnlockAsk) -> Result<String, UnlockRefusal> {
    if !is_plain(&ask.user) || !needs_a_pin(account, owner, &ask.user)? {
        return Err(UnlockRefusal::NotLocked);
    }
    let switched = account
        .switch(owner, (&ask.user, &ask.pin))
        .map_err(|failure| switch_refused(account, owner, failure))?;
    account
        .server_token(&switched, &ask.server)
        .map_err(refusal)?
        .ok_or(UnlockRefusal::Other)
}

fn needs_a_pin(account: &Account<'_>, owner: &str, user: &str) -> Result<bool, UnlockRefusal> {
    let friends = account.friends(owner).map_err(refusal)?;
    Ok(friends
        .iter()
        .any(|friend| friend.id == user && friend.protected))
}

fn switch_refused(account: &Account<'_>, owner: &str, failure: Failure) -> UnlockRefusal {
    if !failure.is_an_answer() {
        return refusal(failure);
    }
    match account.me(owner) {
        Ok(_) => UnlockRefusal::Pin,
        Err(failure) => refusal(failure),
    }
}

fn refusal(failure: Failure) -> UnlockRefusal {
    match failure {
        Failure::Unreached(_) => UnlockRefusal::Unreachable,
        Failure::Denied(_) => UnlockRefusal::Credentials,
        Failure::Status(..) | Failure::Unreadable(_) => UnlockRefusal::Other,
    }
}

#[cfg(test)]
mod tests;
