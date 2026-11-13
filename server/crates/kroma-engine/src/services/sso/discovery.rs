//! What a provider publishes about itself: its discovery document and its
//! signing keys, fetched once and remembered.

use std::collections::HashMap;
use std::sync::Mutex;

use kroma_http::address::web_target;
use serde::Deserialize;

use super::keys::KeySet;

pub const PURPOSE: &str = "sign-in";
const MAX_TIME_SECS: u32 = 10;
const MAX_DOCUMENT_BYTES: u64 = 512 * 1024;
const REMEMBERED_SECS: i64 = 3600;
// A token naming an unknown key triggers a refetch, and anyone can send one.
const KEY_REFETCH_SECS: i64 = 60;

/// The parts of a discovery document this server reads.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Metadata {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub jwks_uri: String,
    #[serde(default)]
    pub userinfo_endpoint: Option<String>,
    #[serde(default)]
    pub scopes_supported: Vec<String>,
    #[serde(default)]
    pub token_endpoint_auth_methods_supported: Vec<String>,
}

/// Why a provider could not be read, in terms an operator can act on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiscoveryError {
    /// Not an http(s) address, or plain http to a host off the local network.
    Address,
    Unreachable(String),
    /// The address answered, with no discovery document.
    NoDocument(u16),
    Unreadable,
    /// The document describes another issuer than the one asked for.
    IssuerMismatch(String),
    /// One of the provider's own endpoints is not an address this server calls.
    Endpoint(&'static str),
    NoKeys,
}

/// Whether this server will call `url`: https anywhere, plain http only to a
/// host on the local network.
pub fn is_callable(url: &str) -> bool {
    web_target(url).is_some_and(|target| target.https || target.is_local())
}

fn same_issuer(typed: &str, published: &str) -> bool {
    typed.trim().trim_end_matches('/') == published.trim_end_matches('/')
}

fn fetch(url: &str) -> Result<kroma_http::Response, DiscoveryError> {
    kroma_http::Fetch::new()
        .purpose(PURPOSE)
        .no_redirects()
        .max_time(MAX_TIME_SECS)
        .max_bytes(MAX_DOCUMENT_BYTES)
        .header("Accept", "application/json")
        .get(url)
        .map_err(|e| DiscoveryError::Unreachable(format!("{e:#}")))
}

/// Reads the discovery document of `issuer` and checks it describes that
/// issuer and nothing this server would refuse to call. Blocks on the network.
pub fn discover(issuer: &str) -> Result<Metadata, DiscoveryError> {
    let issuer = issuer.trim();
    if !is_callable(issuer) {
        return Err(DiscoveryError::Address);
    }
    let url = format!(
        "{}/.well-known/openid-configuration",
        issuer.trim_end_matches('/')
    );
    let response = fetch(&url)?;
    if !(200..300).contains(&response.status) {
        return Err(DiscoveryError::NoDocument(response.status));
    }
    let metadata: Metadata = response.json().map_err(|_| DiscoveryError::Unreadable)?;
    if !same_issuer(issuer, &metadata.issuer) {
        return Err(DiscoveryError::IssuerMismatch(metadata.issuer));
    }
    let endpoints = [
        ("authorization_endpoint", Some(&metadata.authorization_endpoint)),
        ("token_endpoint", Some(&metadata.token_endpoint)),
        ("jwks_uri", Some(&metadata.jwks_uri)),
        ("userinfo_endpoint", metadata.userinfo_endpoint.as_ref()),
    ];
    for (name, url) in endpoints {
        if url.is_some_and(|url| !is_callable(url)) {
            return Err(DiscoveryError::Endpoint(name));
        }
    }
    Ok(metadata)
}

/// Blocks on the network.
pub fn fetch_keys(metadata: &Metadata) -> Result<KeySet, DiscoveryError> {
    let response = fetch(&metadata.jwks_uri)?;
    if !(200..300).contains(&response.status) {
        return Err(DiscoveryError::NoKeys);
    }
    KeySet::parse(&response.body).ok_or(DiscoveryError::NoKeys)
}

#[derive(Clone)]
struct Known {
    metadata: Metadata,
    keys: KeySet,
    read_at: i64,
    keys_read_at: i64,
}

/// The providers this server has read, by the issuer the operator typed.
#[derive(Default)]
pub struct Directory {
    known: Mutex<HashMap<String, Known>>,
}

impl Directory {
    fn remembered(&self, issuer: &str) -> Option<Known> {
        self.known.lock().ok()?.get(issuer).cloned()
    }

    fn remember(&self, issuer: &str, known: Known) {
        if let Ok(mut all) = self.known.lock() {
            all.insert(issuer.to_string(), known);
        }
    }

    /// The provider's document and keys, read again once an hour. Blocks on the
    /// network when they are not remembered.
    pub fn lookup(&self, issuer: &str, now: i64) -> Result<(Metadata, KeySet), DiscoveryError> {
        if let Some(known) = self.remembered(issuer) {
            if now - known.read_at < REMEMBERED_SECS {
                return Ok((known.metadata, known.keys));
            }
        }
        self.read(issuer, now)
    }

    /// Reads the provider afresh, whatever is remembered.
    pub fn read(&self, issuer: &str, now: i64) -> Result<(Metadata, KeySet), DiscoveryError> {
        let metadata = discover(issuer)?;
        let keys = fetch_keys(&metadata)?;
        self.remember(
            issuer,
            Known {
                metadata: metadata.clone(),
                keys: keys.clone(),
                read_at: now,
                keys_read_at: now,
            },
        );
        Ok((metadata, keys))
    }

    /// The keys read again, for a token that names one this server has not
    /// seen. `None` when they were read less than a minute ago.
    pub fn rotated_keys(&self, issuer: &str, now: i64) -> Option<KeySet> {
        let mut known = self.remembered(issuer)?;
        if now - known.keys_read_at < KEY_REFETCH_SECS {
            return None;
        }
        known.keys_read_at = now;
        if let Ok(keys) = fetch_keys(&known.metadata) {
            known.keys = keys;
        }
        self.remember(issuer, known.clone());
        Some(known.keys)
    }
}
