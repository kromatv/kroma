//! The two calls this server makes to a provider once a person is back from
//! it: the code for tokens, and the user info for claims the ID token left out.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Deserialize;
use serde_json::{Map, Value};

use super::discovery::{Metadata, PURPOSE};
use crate::services::settings::Provider;

const MAX_TIME_SECS: u32 = 15;
const MAX_RESPONSE_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tokens {
    pub id_token: String,
    pub access_token: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExchangeError {
    Unreachable(String),
    /// The provider's own words for why it kept its tokens, when it gave any.
    Refused(u16, Option<String>),
    NoIdToken,
}

#[derive(Deserialize)]
struct TokenResponse {
    id_token: Option<String>,
    access_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenRefusal {
    error: Option<String>,
}

fn form_encoded(value: &str) -> String {
    form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn posts_its_secret(metadata: &Metadata) -> bool {
    let methods = &metadata.token_endpoint_auth_methods_supported;
    methods.iter().any(|m| m == "client_secret_post")
        && !methods.iter().any(|m| m == "client_secret_basic")
}

/// Redeems an authorization code. A provider with no secret is a public
/// client and names itself in the body; one with a secret sends it the way
/// the provider says it accepts. Blocks on the network.
pub fn redeem(
    metadata: &Metadata,
    provider: &Provider,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<Tokens, ExchangeError> {
    let client_id = provider.client_id.trim();
    let mut fields = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("code_verifier", verifier),
    ];
    let mut request = kroma_http::Fetch::new()
        .purpose(PURPOSE)
        .no_redirects()
        .max_time(MAX_TIME_SECS)
        .max_bytes(MAX_RESPONSE_BYTES)
        .header("Accept", "application/json");
    if provider.client_secret.is_empty() {
        fields.push(("client_id", client_id));
    } else if posts_its_secret(metadata) {
        fields.push(("client_id", client_id));
        fields.push(("client_secret", &provider.client_secret));
    } else {
        let credentials = format!(
            "{}:{}",
            form_encoded(client_id),
            form_encoded(&provider.client_secret)
        );
        request = request.header(
            "Authorization",
            format!("Basic {}", STANDARD.encode(credentials)),
        );
    }
    let response = request
        .post_form(&metadata.token_endpoint, &fields)
        .map_err(|e| ExchangeError::Unreachable(format!("{e:#}")))?;
    if !(200..300).contains(&response.status) {
        let said = response.json::<TokenRefusal>().ok().and_then(|r| r.error);
        return Err(ExchangeError::Refused(response.status, said));
    }
    let tokens: TokenResponse = response.json().map_err(|_| ExchangeError::NoIdToken)?;
    Ok(Tokens {
        id_token: tokens.id_token.ok_or(ExchangeError::NoIdToken)?,
        access_token: tokens.access_token,
    })
}

/// The provider's user info, when it has such an endpoint and answers for the
/// same person the ID token named. Blocks on the network.
pub fn user_info(
    metadata: &Metadata,
    access_token: &str,
    subject: &str,
) -> Option<Map<String, Value>> {
    let endpoint = metadata.userinfo_endpoint.as_deref()?;
    let response = kroma_http::Fetch::new()
        .purpose(PURPOSE)
        .no_redirects()
        .max_time(MAX_TIME_SECS)
        .max_bytes(MAX_RESPONSE_BYTES)
        .header("Accept", "application/json")
        .header("Authorization", format!("Bearer {access_token}"))
        .get(endpoint)
        .ok()?
        .ensure_ok()
        .ok()?;
    let claims: Map<String, Value> = response.json().ok()?;
    (claims.get("sub").and_then(Value::as_str) == Some(subject)).then_some(claims)
}
