//! How people may sign in to this server: which built-in methods are on, and
//! the OpenID Connect providers an operator added. Stored under `signIn`.

use std::collections::BTreeMap;

use kroma_config::ProviderEnv;
use kroma_domain::{LibraryScope, Permission};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::db::Pool;

use super::store::Settings;

#[cfg(test)]
mod tests;

pub const SIGN_IN_KEY: &str = "signIn";
/// The id of the provider the `KROMA_OIDC_*` variables describe.
pub const ENV_PROVIDER_ID: &str = "env";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SignIn {
    pub password: bool,
    pub passkeys: bool,
    pub providers: Vec<Provider>,
}

impl Default for SignIn {
    fn default() -> Self {
        SignIn {
            password: true,
            passkeys: true,
            providers: Vec::new(),
        }
    }
}

impl SignIn {
    pub fn provider(&self, id: &str) -> Option<&Provider> {
        self.providers.iter().find(|p| p.id == id)
    }

    /// The providers a person can sign in with right now.
    pub fn live(&self) -> impl Iterator<Item = &Provider> {
        self.providers.iter().filter(|p| p.is_live())
    }
}

/// What happens to a person a provider vouches for and this server has never
/// seen.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NewPeople {
    /// An admin approves each one.
    #[default]
    Ask,
    /// They get an account at once, with the provider's defaults.
    Create,
    /// They are turned away unless they hold an invitation.
    Invite,
}

/// `client_secret` and `tested` are server-side only: the admin view says
/// whether a secret is stored and whether the provider is live.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Provider {
    pub id: String,
    pub label: String,
    pub icon: String,
    pub issuer: String,
    pub client_id: String,
    pub client_secret: String,
    /// Asked for on top of `openid profile email`.
    pub scopes: Vec<String>,
    /// The claim that lists a person's groups, as a dotted path.
    pub group_claim: String,
    /// When not empty, a person must be in one of these to sign in.
    pub required_groups: Vec<String>,
    pub new_people: NewPeople,
    /// What an account created with [`NewPeople::Create`] starts with.
    pub permissions: Vec<Permission>,
    pub libraries: LibraryScope,
    pub enabled: bool,
    /// The [`Provider::fingerprint`] a test sign-in last passed with.
    pub tested: String,
    #[serde(skip)]
    pub from_env: bool,
}

impl Default for Provider {
    fn default() -> Self {
        Provider {
            id: String::new(),
            label: String::new(),
            icon: "key".to_string(),
            issuer: String::new(),
            client_id: String::new(),
            client_secret: String::new(),
            scopes: Vec::new(),
            group_claim: "groups".to_string(),
            required_groups: Vec::new(),
            new_people: NewPeople::Ask,
            permissions: vec![Permission::Playback],
            libraries: LibraryScope::All,
            enabled: true,
            tested: String::new(),
            from_env: false,
        }
    }
}

impl Provider {
    /// Names the connection a test sign-in proved. Anything that changes what
    /// the provider is asked, or who answers, changes it.
    pub fn fingerprint(&self) -> String {
        let mut scopes = self.scopes.clone();
        scopes.sort();
        kroma_primitives::short_hash(&format!(
            "provider|{}|{}|{}|{}|{}",
            self.issuer.trim(),
            self.client_id.trim(),
            self.client_secret,
            scopes.join(" "),
            self.group_claim.trim(),
        ))
    }

    pub fn is_configured(&self) -> bool {
        !self.issuer.trim().is_empty() && !self.client_id.trim().is_empty()
    }

    /// Whether the last test sign-in was made with the current connection. A
    /// provider from the environment has nobody to press the button, so it is
    /// taken at its word.
    pub fn is_tested(&self) -> bool {
        self.from_env || (!self.tested.is_empty() && self.tested == self.fingerprint())
    }

    pub fn is_live(&self) -> bool {
        self.enabled && self.is_configured() && self.is_tested()
    }

    /// The scope string sent to the provider: the three every sign-in needs,
    /// `groups` when the provider says it has one, then the operator's own.
    pub fn scope(&self, supported: &[String]) -> String {
        let mut scopes = vec!["openid", "profile", "email"];
        if supported.iter().any(|s| s == "groups") {
            scopes.push("groups");
        }
        for extra in self.scopes.iter().map(|s| s.trim()) {
            if !extra.is_empty() && !scopes.contains(&extra) {
                scopes.push(extra);
            }
        }
        scopes.join(" ")
    }
}

/// Why a sign-in configuration was not saved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignInRefused {
    /// Passwords cannot go while no provider is live: nobody new could come in.
    PasswordNeedsProvider,
    DuplicateProvider,
}

/// The stored configuration, with the environment's provider first when there
/// is one. The stored entry under [`ENV_PROVIDER_ID`] keeps that provider's
/// policy; its connection always comes from the environment.
pub fn sign_in(settings: &Settings, env: Option<&ProviderEnv>) -> SignIn {
    let mut config: SignIn =
        serde_json::from_value(settings.get(SIGN_IN_KEY)).unwrap_or_default();
    let policy = config
        .providers
        .iter()
        .position(|p| p.id == ENV_PROVIDER_ID)
        .map(|at| config.providers.remove(at));
    if let Some(env) = env {
        let mut provider = policy.unwrap_or_default();
        provider.id = ENV_PROVIDER_ID.to_string();
        provider.issuer = env.issuer.clone();
        provider.client_id = env.client_id.clone();
        provider.client_secret = env.client_secret.clone();
        if !env.label.is_empty() {
            provider.label = env.label.clone();
        }
        provider.from_env = true;
        config.providers.insert(0, provider);
    }
    config
}

/// Saves `incoming` over the stored configuration. A provider that arrives with
/// a blank secret keeps the one stored under its id, and every provider keeps
/// the test it passed: neither ever travels to the client, so neither can come
/// back from it.
pub fn set_sign_in(
    settings: &Settings,
    pool: &Pool,
    env: Option<&ProviderEnv>,
    mut incoming: SignIn,
) -> Result<(), SignInRefused> {
    let stored = sign_in(settings, env);
    incoming
        .providers
        .retain(|p| p.id != ENV_PROVIDER_ID || env.is_some());
    for provider in &mut incoming.providers {
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
    let mut ids: Vec<&str> = incoming.providers.iter().map(|p| p.id.as_str()).collect();
    ids.sort_unstable();
    if ids.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err(SignInRefused::DuplicateProvider);
    }
    if !incoming.password && incoming.live().next().is_none() {
        return Err(SignInRefused::PasswordNeedsProvider);
    }
    for provider in incoming.providers.iter_mut().filter(|p| p.from_env) {
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

/// Records that a test sign-in passed against `fingerprint`. Nothing is written
/// when the provider changed while the admin was at the provider's page.
pub fn mark_provider_tested(settings: &Settings, pool: &Pool, id: &str, fingerprint: &str) {
    settings.update_json(pool, SIGN_IN_KEY, |stored| {
        let mut config: SignIn = serde_json::from_value(stored).unwrap_or_default();
        match config.providers.iter_mut().find(|p| p.id == id) {
            Some(provider) if provider.fingerprint() == fingerprint => {
                provider.tested = fingerprint.to_string();
            }
            _ => {}
        }
        json!(config)
    });
}
