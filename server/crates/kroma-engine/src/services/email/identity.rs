//! Who this server is to the mail relay: one P-256 keypair, minted once and
//! kept in the settings store, never shown to anyone. The relay learns the
//! public half at registration and checks every later call against it.

use anyhow::{Context, Result};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::SecretKey;
use serde_json::json;

use crate::db::Pool;
use crate::services::settings::Settings;

pub const IDENTITY_KEY: &str = "mailRelay.identityKey";
pub const INSTANCE: &str = "mailRelay.instance";
pub const INSTANCE_ORIGIN: &str = "mailRelay.instanceOrigin";

pub fn b64url(bytes: impl AsRef<[u8]>) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

#[derive(Clone)]
pub struct RelayIdentity {
    secret: SecretKey,
}

impl RelayIdentity {
    pub fn generate() -> Self {
        Self {
            secret: SecretKey::random(&mut rand_core::OsRng),
        }
    }

    pub fn from_base64url(private: &str) -> Result<Self> {
        let bytes = URL_SAFE_NO_PAD
            .decode(private.trim())
            .context("relay identity is not base64url")?;
        let secret = SecretKey::from_slice(&bytes).context("relay identity is not a P-256 scalar")?;
        Ok(Self { secret })
    }

    pub fn private_base64url(&self) -> String {
        b64url(self.secret.to_bytes())
    }

    /// The uncompressed public point, base64url: what the relay is told once.
    pub fn public_base64url(&self) -> String {
        b64url(self.secret.public_key().to_encoded_point(false).as_bytes())
    }

    /// ECDSA-SHA-256 over `text`, as raw `r || s`, base64url: what the relay checks.
    pub fn sign(&self, text: &str) -> String {
        let key = SigningKey::from(&self.secret);
        let signature: Signature = key.sign(text.as_bytes());
        b64url(signature.to_bytes())
    }
}

/// The stored identity, minted on first use. Written through the internal
/// setter: it is not a preference and must not depend on a declaration.
pub fn ensure_identity(settings: &Settings, pool: &Pool) -> Result<RelayIdentity> {
    let stored = settings.get_str(IDENTITY_KEY, "");
    if !stored.is_empty() {
        return RelayIdentity::from_base64url(&stored);
    }
    let identity = RelayIdentity::generate();
    settings.set_internal(pool, IDENTITY_KEY, json!(identity.private_base64url()));
    tracing::info!("minted an identity for the mail relay");
    Ok(identity)
}

#[cfg(test)]
mod tests {
    use p256::ecdsa::signature::Verifier;
    use p256::ecdsa::VerifyingKey;

    use super::*;

    #[test]
    fn a_signature_verifies_under_the_public_point_the_relay_is_given() {
        let identity = RelayIdentity::generate();
        let public = URL_SAFE_NO_PAD
            .decode(identity.public_base64url())
            .unwrap();
        let signature = URL_SAFE_NO_PAD
            .decode(identity.sign("nonce"))
            .unwrap();

        let key = VerifyingKey::from_sec1_bytes(&public).unwrap();
        let signature = Signature::from_slice(&signature).unwrap();
        assert!(key.verify(b"nonce", &signature).is_ok());
        assert!(key.verify(b"other", &signature).is_err());
        assert_eq!(public.len(), 65);
    }

    #[test]
    fn the_identity_survives_a_round_trip_through_its_stored_form() {
        let identity = RelayIdentity::generate();

        let restored = RelayIdentity::from_base64url(&identity.private_base64url()).unwrap();

        assert_eq!(restored.public_base64url(), identity.public_base64url());
        assert!(RelayIdentity::from_base64url("not a key").is_err());
    }

    #[test]
    fn the_identity_is_minted_once_and_then_reused() {
        let pool = crate::db::testing::temp_pool("relay-identity");
        let settings = Settings::load(&pool);

        let first = ensure_identity(&settings, &pool).unwrap();
        let second = ensure_identity(&settings, &pool).unwrap();

        assert_eq!(first.public_base64url(), second.public_base64url());
        assert!(!settings.get_str(IDENTITY_KEY, "").is_empty());
    }
}
