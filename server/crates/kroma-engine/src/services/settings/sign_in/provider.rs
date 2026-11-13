//! One OpenID Connect provider as the operator configured it: how the server
//! reaches it, who it lets in, and what its button looks like.

use kroma_domain::{LibraryScope, Permission};
use serde::{Deserialize, Serialize};

/// What happens to a person a provider vouches for and this server has never
/// seen.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NewPeople {
    /// An admin approves each one.
    Ask,
    /// They get an account at once, with the provider's defaults.
    Create,
    /// They are turned away unless they hold an invitation.
    #[default]
    Invite,
}

/// `client_secret` and `tested` are server-side only: the admin view says
/// whether a secret is stored and whether the provider is live.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Provider {
    pub id: String,
    pub label: String,
    /// Which known provider this is (`keycloak`, `authentik`, ...), or blank.
    /// It picks the button's mark and look, and nothing about the connection.
    pub preset: String,
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
            preset: String::new(),
            icon: "key".to_string(),
            issuer: String::new(),
            client_id: String::new(),
            client_secret: String::new(),
            scopes: Vec::new(),
            group_claim: "groups".to_string(),
            required_groups: Vec::new(),
            new_people: NewPeople::Invite,
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
