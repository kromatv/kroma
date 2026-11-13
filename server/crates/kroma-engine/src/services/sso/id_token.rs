//! Verifying an ID token: its signature, then every claim that says who it is
//! for and when (OpenID Connect Core 1.0, section 3.1.3.7).

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Deserialize;
use serde_json::{Map, Value};

use super::keys::{Algorithm, KeySet, SignatureError};

const MAX_TOKEN_BYTES: usize = 64 * 1024;
const MAX_SUBJECT_BYTES: usize = 255;
/// How far this server's clock and the provider's may disagree.
pub const CLOCK_SKEW_SECS: i64 = 60;

/// What a token must say to be this sign-in's.
pub struct Expected<'a> {
    pub issuer: &'a str,
    pub client_id: &'a str,
    pub nonce: &'a str,
    pub now: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenError {
    Malformed,
    /// Signed with anything but RS256 or ES256.
    Algorithm,
    /// Names a key the provider does not publish. Worth one refetch of the
    /// keys: the provider may have rotated them.
    UnknownKey,
    Signature,
    Issuer,
    Audience,
    Expired,
    NotYetValid,
    Nonce,
    Subject,
}

/// A token that passed every check.
#[derive(Debug, Clone, PartialEq)]
pub struct Verified {
    pub subject: String,
    pub claims: Map<String, Value>,
}

#[derive(Deserialize)]
struct Header {
    alg: String,
    kid: Option<String>,
    crit: Option<Value>,
}

pub fn verify(token: &str, keys: &KeySet, expected: &Expected) -> Result<Verified, TokenError> {
    if token.len() > MAX_TOKEN_BYTES {
        return Err(TokenError::Malformed);
    }
    let mut parts = token.split('.');
    let (Some(header), Some(payload), Some(signature), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(TokenError::Malformed);
    };
    let header: Header = json_segment(header)?;
    if header.crit.is_some() {
        return Err(TokenError::Malformed);
    }
    let alg = Algorithm::parse(&header.alg).ok_or(TokenError::Algorithm)?;
    let signature = URL_SAFE_NO_PAD
        .decode(signature)
        .map_err(|_| TokenError::Malformed)?;
    let signed = &token[..token.len() - signature_segment_len(token)];
    keys.verify(alg, header.kid.as_deref(), signed.as_bytes(), &signature)
        .map_err(|e| match e {
            SignatureError::UnknownKey => TokenError::UnknownKey,
            SignatureError::Invalid => TokenError::Signature,
        })?;

    let claims: Map<String, Value> = json_segment(payload)?;
    check_claims(&claims, expected)?;
    let subject = claims
        .get("sub")
        .and_then(Value::as_str)
        .filter(|sub| !sub.is_empty() && sub.len() <= MAX_SUBJECT_BYTES)
        .ok_or(TokenError::Subject)?
        .to_string();
    Ok(Verified { subject, claims })
}

fn signature_segment_len(token: &str) -> usize {
    token.rsplit('.').next().map_or(0, str::len) + 1
}

fn json_segment<T: serde::de::DeserializeOwned>(segment: &str) -> Result<T, TokenError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(segment)
        .map_err(|_| TokenError::Malformed)?;
    serde_json::from_slice(&bytes).map_err(|_| TokenError::Malformed)
}

fn check_claims(claims: &Map<String, Value>, expected: &Expected) -> Result<(), TokenError> {
    if claims.get("iss").and_then(Value::as_str) != Some(expected.issuer) {
        return Err(TokenError::Issuer);
    }
    check_audience(claims, expected.client_id)?;
    let exp = claims
        .get("exp")
        .and_then(Value::as_i64)
        .ok_or(TokenError::Expired)?;
    if expected.now >= exp + CLOCK_SKEW_SECS {
        return Err(TokenError::Expired);
    }
    for not_before in ["iat", "nbf"] {
        let starts = claims.get(not_before).and_then(Value::as_i64);
        if starts.is_some_and(|at| at > expected.now + CLOCK_SKEW_SECS) {
            return Err(TokenError::NotYetValid);
        }
    }
    if claims.get("nonce").and_then(Value::as_str) != Some(expected.nonce) {
        return Err(TokenError::Nonce);
    }
    Ok(())
}

fn check_audience(claims: &Map<String, Value>, client_id: &str) -> Result<(), TokenError> {
    let audiences: Vec<&str> = match claims.get("aud") {
        Some(Value::String(one)) => vec![one.as_str()],
        Some(Value::Array(many)) => many.iter().filter_map(Value::as_str).collect(),
        _ => Vec::new(),
    };
    if !audiences.contains(&client_id) {
        return Err(TokenError::Audience);
    }
    let authorized = claims.get("azp").and_then(Value::as_str);
    let ours = match authorized {
        Some(azp) => azp == client_id,
        None => audiences.len() == 1,
    };
    if ours {
        Ok(())
    } else {
        Err(TokenError::Audience)
    }
}

#[cfg(test)]
mod tests;
