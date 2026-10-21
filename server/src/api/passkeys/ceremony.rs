use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use webauthn_rs::prelude::{
    CreationChallengeResponse, DiscoverableAuthentication, Passkey, PasskeyRegistration, Url, Uuid,
    Webauthn, WebauthnBuilder,
};
use webauthn_rs_proto::ResidentKeyRequirement;

use crate::api::error::lerr;
use crate::services::auth;
use crate::state::SharedState;

const CEREMONY_TTL_SECS: i64 = 300;
// A ceiling on live ceremonies, so an anonymous flood of authenticate/start
// cannot grow the map without bound. Far above any real concurrent login count.
const MAX_CEREMONIES: usize = 4096;

pub(super) enum Ceremony {
    Register {
        user_id: String,
        reg: PasskeyRegistration,
    },
    Discover {
        auth: DiscoverableAuthentication,
    },
}

struct Entry {
    expires: i64,
    ceremony: Ceremony,
}

static CEREMONIES: LazyLock<Mutex<HashMap<String, Entry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

pub(super) fn stash(ceremony: Ceremony) -> String {
    let id = auth::random_token();
    if let Ok(mut m) = CEREMONIES.lock() {
        let n = now();
        m.retain(|_, e| e.expires > n);
        // Past the ceiling, drop the soonest-to-expire entries. A started
        // ceremony nobody finishes is worthless, so shedding the oldest costs a
        // flood its slots before it costs a real login its own.
        while m.len() >= MAX_CEREMONIES {
            let Some(oldest) = m
                .iter()
                .min_by_key(|(_, e)| e.expires)
                .map(|(k, _)| k.clone())
            else {
                break;
            };
            m.remove(&oldest);
        }
        m.insert(
            id.clone(),
            Entry {
                expires: n + CEREMONY_TTL_SECS,
                ceremony,
            },
        );
    }
    id
}

pub(super) fn take(id: &str) -> Option<Ceremony> {
    let mut m = CEREMONIES.lock().ok()?;
    let e = m.remove(id)?;
    (e.expires > now()).then_some(e.ceremony)
}

// Deterministic, so re-registration keeps the same WebAuthn user handle.
pub(super) fn user_uuid(user_id: &str) -> Uuid {
    Uuid::new_v5(&Uuid::NAMESPACE_OID, user_id.as_bytes())
}

/// The origins a passkey assertion is accepted from. When the operator has set a
/// canonical web URL (or a Remote Access URL), those are the only origins
/// honoured, which stops another service sharing the host name on a different
/// port from relaying an assertion for this server. Empty when neither is set:
/// a fresh install then trusts the request origin, so passkeys work out of the
/// box and a LAN-only server is not locked out.
pub(super) fn allowed_origins(state: &SharedState) -> Vec<String> {
    let trim = |s: String| s.trim().trim_end_matches('/').to_string();
    let mut out = Vec::new();
    if let Some(web) = state.config.web_url.clone() {
        out.push(trim(web));
    }
    let remote = crate::services::settings::public_url(&state.settings);
    if !remote.is_empty() {
        out.push(trim(remote));
    }
    out.retain(|o| !o.is_empty());
    out.dedup();
    out
}

pub(super) fn relying_party(
    headers: &HeaderMap,
    loc: &str,
    allowed: &[String],
) -> Result<Webauthn, Response> {
    let origin = headers
        .get(axum::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originMissing"))?;
    // When the operator has pinned the origins, an assertion from anywhere else
    // is refused before it is ever built into a ceremony.
    if !allowed.is_empty() {
        let seen = origin.trim().trim_end_matches('/');
        if !allowed.iter().any(|o| o == seen) {
            return Err(lerr(loc, StatusCode::BAD_REQUEST, "passkey.originInvalid"));
        }
    }
    let url = Url::parse(origin)
        .map_err(|_| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originInvalid"))?;
    let rp_id = url
        .host_str()
        .ok_or_else(|| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originInvalid"))?
        .to_string();
    // `allow_any_port` is kept only when nothing is pinned: a pinned origin
    // carries its own port, and matching it exactly is the point.
    let any_port = allowed.is_empty();
    WebauthnBuilder::new(&rp_id, &url)
        .and_then(|b| b.allow_any_port(any_port).rp_name("KROMA").build())
        .map_err(|_| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originInvalid"))
}

pub(super) fn require_discoverable(ccr: &mut CreationChallengeResponse) {
    if let Some(selection) = ccr.public_key.authenticator_selection.as_mut() {
        selection.resident_key = Some(ResidentKeyRequirement::Required);
        selection.require_resident_key = true;
    }
}

pub(super) fn parse_passkeys(blobs: &[String]) -> Vec<(String, Passkey)> {
    blobs
        .iter()
        .filter_map(|j| serde_json::from_str::<Passkey>(j).ok())
        .map(|pk| (hex::encode(pk.cred_id()), pk))
        .collect()
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_ceremony_store_never_grows_past_its_ceiling() {
        if let Ok(mut m) = CEREMONIES.lock() {
            m.clear();
        }
        let webauthn = WebauthnBuilder::new("example.com", &Url::parse("https://example.com").unwrap())
            .unwrap()
            .rp_name("KROMA")
            .build()
            .unwrap();
        let (_, auth) = webauthn.start_discoverable_authentication().unwrap();

        for _ in 0..(MAX_CEREMONIES + 500) {
            stash(Ceremony::Discover { auth: auth.clone() });
        }

        let len = CEREMONIES.lock().unwrap().len();
        assert!(len <= MAX_CEREMONIES, "{len} live ceremonies");
    }

    fn headers_with_origin(origin: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(
            axum::http::header::ORIGIN,
            axum::http::HeaderValue::from_str(origin).unwrap(),
        );
        h
    }

    #[test]
    fn a_pinned_origin_is_the_only_one_accepted() {
        let allowed = vec!["https://kroma.example".to_string()];

        assert!(relying_party(&headers_with_origin("https://kroma.example"), "en", &allowed).is_ok());
        // Same host, another port: the relay a sibling service could mount.
        assert!(relying_party(&headers_with_origin("https://kroma.example:8443"), "en", &allowed).is_err());
        assert!(relying_party(&headers_with_origin("https://evil.example"), "en", &allowed).is_err());
    }

    #[test]
    fn with_nothing_pinned_the_request_origin_is_trusted() {
        assert!(relying_party(&headers_with_origin("https://kroma.local:4040"), "en", &[]).is_ok());
    }
}
