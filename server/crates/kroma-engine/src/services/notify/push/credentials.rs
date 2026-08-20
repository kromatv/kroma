use std::sync::{Arc, Mutex, OnceLock, PoisonError};

use kroma_module_host::HostStorage;
use kroma_push::webpush::VapidKey;
use serde_json::json;

use crate::services::jobs::now_ms;

use super::deliver::send;
use super::transports;
use super::{
    subject_of, Sender, APNS_KEY_ID, APNS_KEY_P8, APNS_TEAM_ID, APNS_TOPIC, FCM_SERVICE_ACCOUNT,
    VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY,
};

#[cfg(test)]
mod tests;

// Env is read first so a distribution can carry the app's own Apple and Google
// keys; the stored setting is the fallback a fork writes to.
fn from_env_or_setting<S: HostStorage>(state: &S, var: &str, key: &str) -> String {
    match std::env::var(var) {
        Ok(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => state.setting_str(key, "").trim().to_string(),
    }
}

/// The server's VAPID public key, minting the keypair on first call.
pub fn public_key<S: HostStorage>(state: &S) -> anyhow::Result<String> {
    if let Some(key) = keys_for(&credentials(state)).web.as_ref() {
        return Ok(key.public_base64url());
    }
    let key = VapidKey::generate();
    let public = key.public_base64url();
    state.set_settings(std::collections::BTreeMap::from([
        (VAPID_PUBLIC_KEY.to_string(), json!(public)),
        (VAPID_PRIVATE_KEY.to_string(), json!(key.private_base64url())),
    ]));
    tracing::info!("minted a VAPID keypair for Web Push");
    Ok(public)
}

// Compared raw so a `.p8` pasted into the admin console takes effect on the
// next push rather than after a restart.
#[derive(Clone, PartialEq, Eq)]
pub(super) struct Credentials {
    vapid_private: String,
    apns_p8: String,
    apns_key_id: String,
    apns_team_id: String,
    apns_topic: String,
    fcm_service_account: String,
}

// Parsed credentials, kept between emissions: each key caches its bearer token
// internally, and Apple rate-limits JWT signing to one per 20 minutes per key.
#[derive(Default)]
pub(super) struct Keys {
    pub(super) web: Option<Arc<VapidKey>>,
    apns: Option<Arc<kroma_push::apns::ApnsKey>>,
    fcm: Option<Arc<kroma_push::fcm::FcmKey>>,
}

type Cached = Mutex<Option<(Credentials, Arc<Keys>)>>;

static PARSED: OnceLock<Cached> = OnceLock::new();

pub(super) fn credentials<S: HostStorage>(state: &S) -> Credentials {
    Credentials {
        vapid_private: state.setting_str(VAPID_PRIVATE_KEY, ""),
        apns_p8: from_env_or_setting(state, "KROMA_APNS_KEY_P8", APNS_KEY_P8),
        apns_key_id: from_env_or_setting(state, "KROMA_APNS_KEY_ID", APNS_KEY_ID),
        apns_team_id: from_env_or_setting(state, "KROMA_APNS_TEAM_ID", APNS_TEAM_ID),
        apns_topic: match std::env::var("KROMA_APNS_TOPIC") {
            Ok(v) if !v.trim().is_empty() => v.trim().to_string(),
            _ => APNS_TOPIC.to_string(),
        },
        fcm_service_account: from_env_or_setting(
            state,
            "KROMA_FCM_SERVICE_ACCOUNT",
            FCM_SERVICE_ACCOUNT,
        ),
    }
}

pub(super) fn keys_for(credentials: &Credentials) -> Arc<Keys> {
    let slot = PARSED.get_or_init(|| Mutex::new(None));
    let mut slot = slot.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some((known, keys)) = slot.as_ref() {
        if known == credentials {
            return Arc::clone(keys);
        }
    }
    let keys = Arc::new(parse(credentials));
    *slot = Some((credentials.clone(), Arc::clone(&keys)));
    keys
}

// Each transport is independent: an unusable Apple key must not take Web Push
// down with it.
fn parse(credentials: &Credentials) -> Keys {
    let web = if credentials.vapid_private.is_empty() {
        None
    } else {
        match VapidKey::from_base64url(&credentials.vapid_private) {
            Ok(key) => Some(Arc::new(key)),
            Err(e) => {
                tracing::error!(error = %e, "stored VAPID key is unusable");
                None
            }
        }
    };

    let apns = if credentials.apns_p8.is_empty() {
        None
    } else {
        let key = kroma_push::apns::ApnsKey::new(
            &credentials.apns_p8,
            credentials.apns_key_id.clone(),
            credentials.apns_team_id.clone(),
            credentials.apns_topic.clone(),
            // Where the FIRST attempt goes: a token's environment is a property
            // of the token, and production covers all but development installs.
            kroma_push::apns::Environment::Production,
        );
        match key {
            Ok(key) => Some(Arc::new(key)),
            Err(e) => {
                tracing::error!(error = %e, "APNs credentials are unusable; iOS push disabled");
                None
            }
        }
    };

    let fcm = if credentials.fcm_service_account.is_empty() {
        None
    } else {
        match kroma_push::fcm::FcmKey::new(&credentials.fcm_service_account) {
            Ok(key) => Some(Arc::new(key)),
            Err(e) => {
                tracing::error!(error = %e, "FCM credentials are unusable; Android push disabled");
                None
            }
        }
    };

    Keys { web, apns, fcm }
}

/// The server's push identity for this emission.
pub fn sender<S: HostStorage>(state: &S) -> Sender {
    let keys = keys_for(&credentials(state));
    transports::Senders {
        web: keys
            .web
            .clone()
            .map(|key| transports::WebPush { key, subject: subject_of(state) }),
        apns: keys.apns.clone().map(|key| transports::Apns { key }),
        // The token exchange is a network call: once per emission, not per device.
        fcm: keys.fcm.clone().and_then(|key| match fcm_access_token(&key) {
            Ok(access_token) => Some(transports::Fcm { key, access_token }),
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "could not obtain an FCM access token; Android push skipped"
                );
                None
            }
        }),
    }
}

fn fcm_access_token(key: &kroma_push::fcm::FcmKey) -> anyhow::Result<String> {
    let now = now_ms() / 1_000;
    if let Some(token) = key.cached_token(now) {
        return Ok(token);
    }
    let request = key.token_request(now)?;
    let response = send(&request)?;
    if !(200..300).contains(&response.status) {
        anyhow::bail!("token endpoint returned {}: {}", response.status, response.text());
    }
    key.store_token(&response.text(), now)
}
