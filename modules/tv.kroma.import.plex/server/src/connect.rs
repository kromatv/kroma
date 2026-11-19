use anyhow::Result;
use kroma_module_sdk::primitives::random_token;

use crate::account::{Me, Pin, PinState, Resource, PRODUCT};
use crate::failure::Failure;
use crate::plex::Plex;
use crate::store::{self, Finished, Pending, ServerRow, SignIn};
use crate::wire::{ConnectAsk, Connected, Refusal, ServerRef};

const PIN_SECONDS: i64 = 15 * 60;

impl Plex {
    /// Starts a sign-in on plex.tv, or says how the one `ask.pending` names
    /// stands. `now` is unix seconds.
    pub(crate) fn connect(&self, ask: &ConnectAsk, now: i64) -> Result<Connected> {
        store::sweep_pending(&self.store, now)?;
        match ask.pending.as_deref() {
            Some(pending) => self.asked_again(pending, now),
            None => self.start(now),
        }
    }

    fn start(&self, now: i64) -> Result<Connected> {
        let client = store::client_id(&self.store)?;
        let pin = match self.account(&client).start_pin() {
            Ok(pin) => pin,
            Err(failure) => return Ok(refused(failure)),
        };
        let pending = Pending {
            id: random_token(),
            pin_id: pin.id,
            code: pin.code,
            expires_at: now + PIN_SECONDS,
            sign_in: None,
        };
        store::open_pending(&self.store, &pending)?;
        Ok(waiting(&client, &pending))
    }

    fn asked_again(&self, id: &str, now: i64) -> Result<Connected> {
        let Some(pending) = store::pending(&self.store, id)? else {
            return Ok(expired());
        };
        if let Some(sign_in) = &pending.sign_in {
            return self.ready(sign_in);
        }
        let client = store::client_id(&self.store)?;
        let pin = Pin {
            id: pending.pin_id,
            code: pending.code.clone(),
        };
        let state = self.account(&client).pin_state(&pin);
        match state {
            Ok(PinState::Approved(token)) => self.finish(&pending, token, now),
            Ok(PinState::Gone) => {
                store::drop_pending(&self.store, id)?;
                Ok(expired())
            }
            Ok(PinState::Waiting) => Ok(waiting(&client, &pending)),
            Err(failure) if will_pass(failure) => Ok(waiting(&client, &pending)),
            Err(failure) => Ok(refused(failure)),
        }
    }

    fn finish(&self, pending: &Pending, token: String, now: i64) -> Result<Connected> {
        let client = store::client_id(&self.store)?;
        let (me, owned) = match self.owned_by(&client, &token) {
            Ok(read) => read,
            Err(failure) if will_pass(failure) => return Ok(waiting(&client, pending)),
            Err(failure) => return Ok(refused(failure)),
        };
        if owned.is_empty() {
            store::drop_pending(&self.store, &pending.id)?;
            return Ok(Connected::Refused {
                reason: Refusal::NotAdministrator,
            });
        }
        let sign_in = SignIn {
            id: random_token(),
            token,
            account_id: me.id,
        };
        let servers: Vec<ServerRow> = owned.into_iter().map(kept).collect();
        let finished = Finished {
            pending: &pending.id,
            sign_in: &sign_in,
            servers: &servers,
            now,
        };
        store::keep_sign_in(&self.store, &finished)?;
        self.ready(&sign_in.id)
    }

    fn owned_by(&self, client: &str, token: &str) -> Result<(Me, Vec<Resource>), Failure> {
        let account = self.account(client);
        let me = account.me(token)?;
        Ok((me, account.servers(token)?))
    }

    fn ready(&self, sign_in: &str) -> Result<Connected> {
        let servers = store::servers(&self.store, sign_in)?
            .into_iter()
            .map(|row| ServerRef {
                id: row.id,
                name: row.name,
                address: row.address,
            })
            .collect();
        Ok(Connected::Ready {
            sign_in: sign_in.to_string(),
            servers,
        })
    }
}

fn kept(owned: Resource) -> ServerRow {
    ServerRow {
        address: owned.address(),
        id: owned.id,
        name: owned.name,
        token: owned.token,
        route: None,
    }
}

fn waiting(client: &str, pending: &Pending) -> Connected {
    Connected::Pending {
        pending: pending.id.clone(),
        url: format!(
            "https://app.plex.tv/auth#?clientID={client}&code={}&context%5Bdevice%5D%5Bproduct%5D={PRODUCT}",
            pending.code
        ),
        expires_at: pending.expires_at,
    }
}

fn will_pass(failure: Failure) -> bool {
    matches!(
        failure,
        Failure::Unreached(_) | Failure::Status(_, 429 | 500..=599)
    )
}

fn expired() -> Connected {
    Connected::Refused {
        reason: Refusal::Expired,
    }
}

fn refused(failure: Failure) -> Connected {
    let reason = match failure {
        Failure::Unreached(_) => Refusal::Unreachable,
        Failure::Denied(_) => Refusal::Credentials,
        Failure::Status(..) | Failure::Unreadable(_) => Refusal::Other,
    };
    Connected::Refused { reason }
}

#[cfg(test)]
mod tests;
