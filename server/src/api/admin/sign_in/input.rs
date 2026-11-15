//! The sign-in methods as the admin page sends them, and the stored form they
//! become.

use std::collections::HashSet;

use serde::Deserialize;

use crate::model::Permission;
use crate::services::settings::{
    BuiltIn, Method, NewPeople, Provider, SignIn, ENV_PROVIDER_ID, PASSKEY_ID, PASSWORD_ID,
};
use crate::services::sso::discovery::is_callable;

const MAX_LABEL_CHARS: usize = 40;
const MAX_FIELD_CHARS: usize = 512;
const MAX_LIST_ENTRIES: usize = 32;

/// One method as the admin page sends it, in the order it should be offered.
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum MethodInput {
    Password { enabled: bool },
    Passkey { enabled: bool },
    Oidc(Box<ProviderInput>),
}

/// A provider as the admin page sends it. A blank `id` is a new provider, and
/// a blank or absent `clientSecret` keeps the stored one.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInput {
    #[serde(default)]
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub preset: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub issuer: String,
    #[serde(default)]
    pub client_id: String,
    #[serde(default)]
    pub client_secret: Option<String>,
    #[serde(default)]
    pub scopes: Vec<String>,
    #[serde(default)]
    pub group_claim: String,
    #[serde(default)]
    pub required_groups: Vec<String>,
    #[serde(default)]
    pub new_people: NewPeople,
    #[serde(default)]
    pub permissions: Vec<Permission>,
    #[serde(default)]
    pub libraries: Option<Vec<String>>,
    pub enabled: bool,
}

fn cleaned(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && seen.insert(value.clone()))
        .collect()
}

fn is_scope_token(scope: &str) -> bool {
    scope
        .bytes()
        .all(|b| matches!(b, 0x21 | 0x23..=0x5b | 0x5d..=0x7e))
}

fn is_reserved_id(id: &str) -> bool {
    id == PASSWORD_ID || id == PASSKEY_ID
}

fn is_icon_name(icon: &str) -> bool {
    icon.len() <= 32
        && icon
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn provider_from(input: ProviderInput, from_env: bool) -> Result<Provider, &'static str> {
    let defaults = Provider::default();
    let preset = input.preset.trim().to_string();
    if is_reserved_id(input.id.trim()) || !is_icon_name(&preset) {
        return Err("sso.providerInvalid");
    }
    let label = input.label.trim().to_string();
    if label.is_empty() || label.chars().count() > MAX_LABEL_CHARS {
        return Err("sso.labelInvalid");
    }
    let issuer = input.issuer.trim().to_string();
    if !from_env && (issuer.len() > MAX_FIELD_CHARS || !is_callable(&issuer)) {
        return Err("sso.issuerInvalid");
    }
    let scopes = cleaned(input.scopes);
    let required_groups = cleaned(input.required_groups);
    let group_claim = Some(input.group_claim.trim().to_string())
        .filter(|claim| !claim.is_empty())
        .unwrap_or(defaults.group_claim);
    let too_long = |value: &String| value.len() > MAX_FIELD_CHARS;
    let icon = Some(input.icon.trim().to_string())
        .filter(|icon| !icon.is_empty())
        .unwrap_or(defaults.icon);
    if scopes.len() > MAX_LIST_ENTRIES
        || required_groups.len() > MAX_LIST_ENTRIES
        || scopes.iter().any(|scope| too_long(scope) || !is_scope_token(scope))
        || required_groups.iter().any(too_long)
        || too_long(&group_claim)
        || too_long(&input.client_id)
        || input.client_secret.as_ref().is_some_and(too_long)
        || !is_icon_name(&icon)
    {
        return Err("sso.providerInvalid");
    }
    let libraries = crate::api::admin::users::library_scope(input.libraries).ok_or("admin.tooManyLibraries")?;
    Ok(Provider {
        id: input.id.trim().to_string(),
        label,
        preset,
        icon,
        issuer,
        client_id: input.client_id.trim().to_string(),
        client_secret: input.client_secret.unwrap_or_default(),
        scopes,
        group_claim,
        required_groups,
        new_people: input.new_people,
        permissions: if input.permissions.is_empty() {
            defaults.permissions
        } else {
            input.permissions
        },
        libraries,
        enabled: input.enabled,
        tested: String::new(),
        from_env,
    })
}

fn with_ids(mut methods: Vec<Method>, stored: &SignIn) -> Vec<Method> {
    let mut taken: HashSet<String> = methods
        .iter()
        .chain(&stored.methods)
        .map(|m| m.id().to_string())
        .filter(|id| !id.is_empty())
        .collect();
    let mut next = 0usize;
    for method in &mut methods {
        let Method::Oidc(provider) = method else {
            continue;
        };
        if !provider.id.is_empty() {
            continue;
        }
        provider.id = loop {
            let candidate = format!("p{next}");
            next += 1;
            if taken.insert(candidate.clone()) {
                break candidate;
            }
        };
    }
    methods
}

/// The stored methods for what the admin page sent, in its order, or the
/// message key that says which provider is wrong. `has_env` says whether the
/// environment names a provider, whose connection the page cannot set. A new
/// provider gets an id neither the page nor `stored` uses.
pub(super) fn methods_from(
    inputs: Vec<MethodInput>,
    has_env: bool,
    stored: &SignIn,
) -> Result<Vec<Method>, &'static str> {
    let methods = inputs
        .into_iter()
        .map(|input| match input {
            MethodInput::Password { enabled } => Ok(Method::Password(BuiltIn { enabled })),
            MethodInput::Passkey { enabled } => Ok(Method::Passkey(BuiltIn { enabled })),
            MethodInput::Oidc(provider) => {
                let from_env = has_env && provider.id.trim() == ENV_PROVIDER_ID;
                provider_from(*provider, from_env).map(|p| Method::Oidc(Box::new(p)))
            }
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(with_ids(methods, stored))
}
