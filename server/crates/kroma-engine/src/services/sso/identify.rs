//! From the code a provider's redirect carried to the person it stands for.

use super::admit::Identity;
use super::discovery::{Directory, DiscoveryError, Metadata};
use super::exchange::{self, ExchangeError};
use super::flows::{Flow, Started};
use super::id_token::{self, Expected, TokenError, Verified};
use super::keys::KeySet;
use super::person::{fill_missing, Person};
use crate::services::settings::Provider;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdentifyError {
    Discovery(DiscoveryError),
    Exchange(ExchangeError),
    Token(TokenError),
}

fn plain(word: &str) -> String {
    word.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .take(40)
        .collect()
}

impl DiscoveryError {
    /// A stable name for this failure, for a client to put words on.
    pub fn code(&self) -> &'static str {
        match self {
            DiscoveryError::Address => "discovery.address",
            DiscoveryError::Unreachable(_) => "discovery.unreachable",
            DiscoveryError::NoDocument(_) => "discovery.noDocument",
            DiscoveryError::Unreadable => "discovery.unreadable",
            DiscoveryError::IssuerMismatch(_) => "discovery.issuerMismatch",
            DiscoveryError::Endpoint(_) => "discovery.endpoint",
            DiscoveryError::NoKeys => "discovery.noKeys",
        }
    }
}

impl IdentifyError {
    /// A stable name for where the conversation broke. The provider's own
    /// error word is passed on, stripped to letters, digits and underscores.
    pub fn code(&self) -> String {
        match self {
            IdentifyError::Discovery(e) => e.code().to_string(),
            IdentifyError::Exchange(ExchangeError::Unreachable(_)) => "exchange.unreachable".into(),
            IdentifyError::Exchange(ExchangeError::Refused(_, Some(said))) => {
                format!("exchange.{}", plain(said))
            }
            IdentifyError::Exchange(ExchangeError::Refused(_, None)) => "exchange.refused".into(),
            IdentifyError::Exchange(ExchangeError::NoIdToken) => "exchange.noIdToken".into(),
            IdentifyError::Token(e) => format!("token.{}", token_word(*e)),
        }
    }
}

fn token_word(e: TokenError) -> &'static str {
    match e {
        TokenError::Malformed => "malformed",
        TokenError::Algorithm => "algorithm",
        TokenError::UnknownKey => "unknownKey",
        TokenError::Signature => "signature",
        TokenError::Issuer => "issuer",
        TokenError::Audience => "audience",
        TokenError::Expired => "expired",
        TokenError::NotYetValid => "notYetValid",
        TokenError::Nonce => "nonce",
        TokenError::Subject => "subject",
    }
}

/// The code for a provider that sent the person back with an error of its own
/// (`access_denied` when they said no).
pub fn provider_said(error: &str) -> String {
    format!("provider.{}", plain(error))
}

impl From<DiscoveryError> for IdentifyError {
    fn from(e: DiscoveryError) -> Self {
        IdentifyError::Discovery(e)
    }
}

impl From<ExchangeError> for IdentifyError {
    fn from(e: ExchangeError) -> Self {
        IdentifyError::Exchange(e)
    }
}

impl From<TokenError> for IdentifyError {
    fn from(e: TokenError) -> Self {
        IdentifyError::Token(e)
    }
}

/// The address a person is sent to at the provider.
pub fn authorize_url(
    metadata: &Metadata,
    provider: &Provider,
    started: &Started,
    redirect_uri: &str,
) -> String {
    let query = form_urlencoded::Serializer::new(String::new())
        .append_pair("response_type", "code")
        .append_pair("client_id", provider.client_id.trim())
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", &provider.scope(&metadata.scopes_supported))
        .append_pair("state", &started.state)
        .append_pair("nonce", &started.nonce)
        .append_pair("code_challenge", &started.challenge)
        .append_pair("code_challenge_method", "S256")
        .finish();
    let joint = if metadata.authorization_endpoint.contains('?') {
        '&'
    } else {
        '?'
    };
    format!("{}{joint}{query}", metadata.authorization_endpoint)
}

fn verified(
    directory: &Directory,
    issuer: &str,
    keys: &KeySet,
    token: &str,
    expected: &Expected,
) -> Result<Verified, TokenError> {
    match id_token::verify(token, keys, expected) {
        Err(TokenError::UnknownKey) => {
            let rotated = directory
                .rotated_keys(issuer, expected.now)
                .ok_or(TokenError::UnknownKey)?;
            id_token::verify(token, &rotated, expected)
        }
        other => other,
    }
}

fn says_enough(claims: &serde_json::Map<String, serde_json::Value>, group_claim: &str) -> bool {
    let person = Person::from_claims("", claims, group_claim);
    person.email.is_some() && person.username.is_some() && !person.groups.is_empty()
}

/// Redeems `code`, verifies the ID token it bought, and reads the person out
/// of it, asking the user info endpoint for whatever the token left out.
/// Blocks on the network.
pub fn identify(
    directory: &Directory,
    provider: &Provider,
    flow: &Flow,
    code: &str,
    now: i64,
) -> Result<Identity, IdentifyError> {
    let (metadata, keys) = directory.lookup(&provider.issuer, now)?;
    let tokens = exchange::redeem(&metadata, provider, code, &flow.verifier, &flow.redirect_uri)?;
    let expected = Expected {
        issuer: &metadata.issuer,
        client_id: provider.client_id.trim(),
        nonce: &flow.nonce,
        now,
    };
    let token = verified(directory, &provider.issuer, &keys, &tokens.id_token, &expected)?;
    let mut claims = token.claims;
    if !says_enough(&claims, &provider.group_claim) {
        let user_info = tokens
            .access_token
            .and_then(|access| exchange::user_info(&metadata, &access, &token.subject));
        if let Some(user_info) = user_info {
            fill_missing(&mut claims, user_info);
        }
    }
    Ok(Identity {
        issuer: metadata.issuer,
        person: Person::from_claims(&token.subject, &claims, &provider.group_claim),
    })
}

#[cfg(test)]
mod tests;
