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

pub(super) fn relying_party(headers: &HeaderMap, loc: &str) -> Result<Webauthn, Response> {
    let origin = headers
        .get(axum::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originMissing"))?;
    let url = Url::parse(origin)
        .map_err(|_| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originInvalid"))?;
    let rp_id = url
        .host_str()
        .ok_or_else(|| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originInvalid"))?
        .to_string();
    WebauthnBuilder::new(&rp_id, &url)
        .and_then(|b| b.allow_any_port(true).rp_name("KROMA").build())
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
}
