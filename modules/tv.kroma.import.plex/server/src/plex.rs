use std::sync::Arc;

use anyhow::{anyhow, Result};
use kroma_module_sdk::db::Pool;

use crate::account::Account;
use crate::failure::Failure;
use crate::server::{Server, SERVER};
use crate::store::{self, ServerKey, SignIn};
use crate::web::Web;
use crate::wire::ForgetAsk;

/// The importer: the seven methods of the `importer` point, each in the file
/// named after it, over the network and the importer's own database.
pub(crate) struct Plex {
    pub(crate) web: Arc<dyn Web>,
    pub(crate) store: Pool,
}

impl Plex {
    pub(crate) fn new(web: Arc<dyn Web>, store: Pool) -> Self {
        Self { web, store }
    }

    pub(crate) fn account<'a>(&'a self, client: &'a str) -> Account<'a> {
        Account {
            web: &*self.web,
            client,
        }
    }

    pub(crate) fn signed_in(&self, id: &str) -> Result<SignIn> {
        store::sign_in(&self.store, id)?
            .ok_or_else(|| anyhow!("this importer holds no such sign-in: sign in to Plex again"))
    }

    /// Runs `work` against a server of a sign-in. When the server stops
    /// answering, the address kept for it is dropped, so the next call looks
    /// for it again.
    pub(crate) fn on_server<T>(
        &self,
        key: ServerKey<'_>,
        work: impl FnOnce(&Server<'_>) -> Result<T>,
    ) -> Result<T> {
        let server = self.reach(key)?;
        let done = work(&server);
        let lost = done
            .as_ref()
            .err()
            .and_then(|error| error.downcast_ref::<Failure>())
            .is_some_and(|failure| *failure == Failure::Unreached(SERVER));
        if lost {
            store::set_route(&self.store, key, None)?;
        }
        done
    }

    pub(crate) fn forget(&self, ask: &ForgetAsk) -> Result<()> {
        store::forget(&self.store, &ask.sign_in)
    }
}
