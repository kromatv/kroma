//! How people may sign in to this server: which built-in methods are on, and
//! the OpenID Connect providers an operator added. Stored under `signIn`.

use std::collections::BTreeMap;

use kroma_config::ProviderEnv;
use kroma_http::address::web_target;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::db::Pool;

use super::store::Settings;

mod provider;
#[cfg(test)]
mod tests;

pub use provider::{NewPeople, Provider};

pub const SIGN_IN_KEY: &str = "signIn";
/// The id of the provider the `KROMA_OIDC_*` variables describe.
pub const ENV_PROVIDER_ID: &str = "env";

/// The id of the password method. There is always exactly one.
pub const PASSWORD_ID: &str = "password";
/// The id of the passkey method. There is always exactly one.
pub const PASSKEY_ID: &str = "passkey";

/// Every way into the server, in the order the sign-in screen offers them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SignIn {
    pub methods: Vec<Method>,
}

/// One way to sign in. Passwords and passkeys are built in and can only be
/// turned off; a provider is added and removed by an admin.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Method {
    Password(BuiltIn),
    Passkey(BuiltIn),
    Oidc(Box<Provider>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct BuiltIn {
    pub enabled: bool,
}

impl Default for BuiltIn {
    fn default() -> Self {
        BuiltIn { enabled: true }
    }
}

impl Method {
    pub fn id(&self) -> &str {
        match self {
            Method::Password(_) => PASSWORD_ID,
            Method::Passkey(_) => PASSKEY_ID,
            Method::Oidc(provider) => &provider.id,
        }
    }
}

impl Default for SignIn {
    fn default() -> Self {
        SignIn {
            methods: vec![
                Method::Password(BuiltIn::default()),
                Method::Passkey(BuiltIn::default()),
            ],
        }
    }
}

impl SignIn {
    fn normalised(mut self) -> SignIn {
        let (mut password, mut passkey) = (false, false);
        self.methods.retain(|method| match method {
            Method::Password(_) => !std::mem::replace(&mut password, true),
            Method::Passkey(_) => !std::mem::replace(&mut passkey, true),
            Method::Oidc(_) => true,
        });
        if !passkey {
            self.methods.insert(0, Method::Passkey(BuiltIn::default()));
        }
        if !password {
            self.methods.insert(0, Method::Password(BuiltIn::default()));
        }
        self
    }

    pub fn password(&self) -> bool {
        self.methods
            .iter()
            .any(|m| matches!(m, Method::Password(built_in) if built_in.enabled))
    }

    pub fn passkeys(&self) -> bool {
        self.methods
            .iter()
            .any(|m| matches!(m, Method::Passkey(built_in) if built_in.enabled))
    }

    pub fn providers(&self) -> impl Iterator<Item = &Provider> {
        self.methods.iter().filter_map(|method| match method {
            Method::Oidc(provider) => Some(provider.as_ref()),
            _ => None,
        })
    }

    fn providers_mut(&mut self) -> impl Iterator<Item = &mut Provider> {
        self.methods.iter_mut().filter_map(|method| match method {
            Method::Oidc(provider) => Some(provider.as_mut()),
            _ => None,
        })
    }

    pub fn provider(&self, id: &str) -> Option<&Provider> {
        self.providers().find(|p| p.id == id)
    }

    /// The providers a person can sign in with right now.
    pub fn live(&self) -> impl Iterator<Item = &Provider> {
        self.providers().filter(|p| p.is_live())
    }
}

/// Why a sign-in configuration was not saved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignInRefused {
    /// Passwords cannot go while no provider is live: nobody new could come in.
    PasswordNeedsProvider,
    DuplicateProvider,
}

/// The stored configuration, with the environment's provider when there is
/// one. The stored entry under [`ENV_PROVIDER_ID`] keeps that provider's
/// policy and its place in the list; its connection always comes from the
/// environment. With no such entry the provider goes last.
pub fn sign_in(settings: &Settings, env: Option<&ProviderEnv>) -> SignIn {
    let mut config = serde_json::from_value::<SignIn>(settings.get(SIGN_IN_KEY))
        .unwrap_or_default()
        .normalised();
    let policy = config.methods.iter().position(|m| m.id() == ENV_PROVIDER_ID);
    let Some(env) = env else {
        if let Some(at) = policy {
            config.methods.remove(at);
        }
        return config;
    };
    let at = policy.unwrap_or_else(|| {
        config.methods.push(Method::Oidc(Box::default()));
        config.methods.len() - 1
    });
    if let Method::Oidc(provider) = &mut config.methods[at] {
        provider.id = ENV_PROVIDER_ID.to_string();
        provider.issuer = env.issuer.clone();
        provider.client_id = env.client_id.clone();
        provider.client_secret = env.client_secret.clone();
        if !env.label.is_empty() {
            provider.label = env.label.clone();
        } else if provider.label.is_empty() {
            provider.label =
                web_target(&env.issuer).map_or_else(|| env.issuer.clone(), |issuer| issuer.host);
        }
        provider.from_env = true;
    }
    config
}

/// Saves `incoming` over the stored configuration. A provider that arrives with
/// a blank secret keeps the one stored under its id, and every provider keeps
/// the test it passed: neither travels to the client, so neither can come
/// back from it.
pub fn set_sign_in(
    settings: &Settings,
    pool: &Pool,
    env: Option<&ProviderEnv>,
    incoming: SignIn,
) -> Result<(), SignInRefused> {
    let stored = sign_in(settings, env);
    let mut incoming = incoming.normalised();
    incoming
        .methods
        .retain(|m| m.id() != ENV_PROVIDER_ID || env.is_some());
    for provider in incoming.providers_mut() {
        let previous = stored.provider(&provider.id);
        match env.filter(|_| provider.id == ENV_PROVIDER_ID) {
            Some(env) => {
                provider.issuer = env.issuer.clone();
                provider.client_id = env.client_id.clone();
                provider.client_secret = env.client_secret.clone();
                provider.from_env = true;
            }
            None => {
                if provider.client_secret.is_empty() {
                    provider.client_secret = previous
                        .map(|p| p.client_secret.clone())
                        .unwrap_or_default();
                }
                provider.from_env = false;
            }
        }
        provider.tested = previous.map(|p| p.tested.clone()).unwrap_or_default();
    }
    let mut ids: Vec<&str> = incoming.methods.iter().map(Method::id).collect();
    ids.sort_unstable();
    if ids.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err(SignInRefused::DuplicateProvider);
    }
    if !incoming.password() && incoming.live().next().is_none() {
        return Err(SignInRefused::PasswordNeedsProvider);
    }
    for provider in incoming.providers_mut().filter(|p| p.from_env) {
        provider.issuer.clear();
        provider.client_id.clear();
        provider.client_secret.clear();
    }
    settings.set_patch(
        pool,
        BTreeMap::from([(SIGN_IN_KEY.to_string(), json!(incoming))]),
    );
    Ok(())
}

fn update_provider(settings: &Settings, pool: &Pool, id: &str, change: impl FnOnce(&mut Provider)) {
    settings.update_json(pool, SIGN_IN_KEY, |stored| {
        let mut config = serde_json::from_value::<SignIn>(stored)
            .unwrap_or_default()
            .normalised();
        if let Some(provider) = config.providers_mut().find(|p| p.id == id) {
            change(provider);
        }
        json!(config)
    });
}

/// Records that a test sign-in passed against `fingerprint`. Nothing is written
/// when the provider changed while the admin was at the provider's page.
pub fn mark_provider_tested(settings: &Settings, pool: &Pool, id: &str, fingerprint: &str) {
    update_provider(settings, pool, id, |provider| {
        if provider.fingerprint() == fingerprint {
            provider.tested = fingerprint.to_string();
        }
    });
}
