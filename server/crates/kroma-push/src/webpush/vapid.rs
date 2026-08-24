//! RFC 8292 VAPID: how a self-hosted server proves to a push service that it is
//! the same sender the browser subscribed to.
//!
//! The server owns a P-256 keypair. The public half goes to the browser at
//! subscribe time (`applicationServerKey`); every push then carries a short-lived
//! JWT signed by the private half, audienced to the push service's origin. No
//! account, no registration, no third party this is the whole reason Web Push
//! works from a NAS on someone's LAN.

use anyhow::{Context, Result};
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::SecretKey;
use serde_json::json;

use crate::b64;

// The RFC caps a VAPID JWT at 24h; 12h is the common choice and leaves room
// for clock skew at both ends.
const TOKEN_LIFETIME_SECS: i64 = 12 * 60 * 60;

/// The server's VAPID identity: one P-256 keypair, generated once and persisted.
#[derive(Clone)]
pub struct VapidKey {
    secret: SecretKey,
}

impl VapidKey {
    /// Mint a new identity. Done once, on the first push subscription; rotating
    /// it invalidates every existing browser subscription, so it is persisted.
    pub fn generate() -> Self {
        Self {
            secret: SecretKey::random(&mut rand_core::OsRng),
        }
    }

    /// Restore from the stored base64url private scalar.
    pub fn from_base64url(private: &str) -> Result<Self> {
        let bytes = b64::decode(private).context("VAPID private key is not base64url")?;
        let secret =
            SecretKey::from_slice(&bytes).context("VAPID private key is not a P-256 scalar")?;
        Ok(Self { secret })
    }

    /// The private scalar, base64url. Persisted; never leaves the server.
    pub fn private_base64url(&self) -> String {
        b64::encode(self.secret.to_bytes())
    }

    /// The uncompressed public point, base64url. This is what the browser needs
    /// as `applicationServerKey`, and what rides in the `k=` of every push.
    pub fn public_base64url(&self) -> String {
        b64::encode(self.secret.public_key().to_encoded_point(false).as_bytes())
    }

    /// Build the `Authorization` header value for one push to `endpoint`.
    ///
    /// `subject` identifies the sender to the push service operator (a `mailto:`
    /// or `https:` URL) so they have someone to contact about a misbehaving
    /// server; it is required by some services and harmless everywhere.
    pub fn authorization(&self, endpoint: &str, subject: &str, now_secs: i64) -> Result<String> {
        let audience = origin_of(endpoint)?;
        let jwt = self.sign_jwt(&audience, subject, now_secs + TOKEN_LIFETIME_SECS)?;
        Ok(format!("vapid t={jwt}, k={}", self.public_base64url()))
    }

    // JOSE wants the raw fixed-width `r || s` signature, not the DER encoding
    // most ECDSA APIs hand back by default.
    fn sign_jwt(&self, audience: &str, subject: &str, exp: i64) -> Result<String> {
        let header = b64::encode(json!({ "typ": "JWT", "alg": "ES256" }).to_string());
        let claims =
            b64::encode(json!({ "aud": audience, "exp": exp, "sub": subject }).to_string());
        let signing_input = format!("{header}.{claims}");

        let signing_key = SigningKey::from(&self.secret);
        let signature: Signature = signing_key.sign(signing_input.as_bytes());
        Ok(format!(
            "{signing_input}.{}",
            b64::encode(signature.to_bytes())
        ))
    }
}

// `scheme://host[:port]` of a push endpoint, for the JWT audience. Audiencing
// to the full endpoint URL (a common mistake) is rejected by some push
// services, and the path carries the subscription's secret id.
fn origin_of(endpoint: &str) -> Result<String> {
    let (scheme, rest) = endpoint
        .split_once("://")
        .context("push endpoint has no scheme")?;
    let host = rest.split('/').next().unwrap_or_default();
    if host.is_empty() {
        anyhow::bail!("push endpoint has no host: {endpoint}");
    }
    Ok(format!("{scheme}://{host}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::signature::Verifier;
    use p256::ecdsa::VerifyingKey;

    #[test]
    fn origin_keeps_scheme_and_host_and_drops_the_subscription_path() {
        assert_eq!(
            origin_of("https://fcm.googleapis.com/fcm/send/abc123").unwrap(),
            "https://fcm.googleapis.com"
        );
        assert_eq!(
            origin_of("https://updates.push.services.mozilla.com/wpush/v2/gAAA").unwrap(),
            "https://updates.push.services.mozilla.com"
        );
        // A port is part of the origin.
        assert_eq!(
            origin_of("https://push.example:8443/x").unwrap(),
            "https://push.example:8443"
        );
        // No path at all is fine.
        assert_eq!(
            origin_of("https://push.example").unwrap(),
            "https://push.example"
        );
    }

    #[test]
    fn origin_rejects_junk() {
        assert!(origin_of("not-a-url").is_err());
        assert!(origin_of("https://").is_err());
    }

    #[test]
    fn a_key_round_trips_through_its_stored_form() {
        let key = VapidKey::generate();
        let restored = VapidKey::from_base64url(&key.private_base64url()).unwrap();
        assert_eq!(restored.private_base64url(), key.private_base64url());
        assert_eq!(restored.public_base64url(), key.public_base64url());
    }

    #[test]
    fn the_public_key_is_an_uncompressed_p256_point() {
        // 65 bytes starting 0x04 exactly what `applicationServerKey` must be;
        // a compressed (33-byte) point is silently rejected by browsers.
        let raw = b64::decode(&VapidKey::generate().public_base64url()).unwrap();
        assert_eq!(raw.len(), 65);
        assert_eq!(raw[0], 0x04);
    }

    #[test]
    fn restoring_a_bad_key_errors_rather_than_panicking() {
        assert!(VapidKey::from_base64url("not base64!!").is_err());
        assert!(VapidKey::from_base64url(&b64::encode([0u8; 8])).is_err());
    }

    #[test]
    fn the_authorization_header_carries_a_verifiable_token_and_the_public_key() {
        let key = VapidKey::generate();
        let header = key
            .authorization(
                "https://push.example/wpush/v2/abc",
                "mailto:ops@example.com",
                1_700_000_000,
            )
            .unwrap();

        let (t, k) = header
            .strip_prefix("vapid t=")
            .and_then(|r| r.split_once(", k="))
            .expect("header is `vapid t=<jwt>, k=<key>`");
        assert_eq!(k, key.public_base64url());

        // Three segments, and the signature verifies over `header.claims`.
        let parts: Vec<&str> = t.split('.').collect();
        assert_eq!(parts.len(), 3);
        let verifying = VerifyingKey::from(SigningKey::from(&key.secret));
        let sig = Signature::from_slice(&b64::decode(parts[2]).unwrap()).unwrap();
        let signed = format!("{}.{}", parts[0], parts[1]);
        assert!(verifying.verify(signed.as_bytes(), &sig).is_ok());

        // A JOSE ES256 signature is the raw 64-byte r||s pair, not DER.
        assert_eq!(b64::decode(parts[2]).unwrap().len(), 64);
    }

    #[test]
    fn the_claims_audience_the_origin_and_expire_in_twelve_hours() {
        let key = VapidKey::generate();
        let now = 1_700_000_000;
        let header = key
            .authorization(
                "https://push.example/wpush/v2/abc",
                "mailto:ops@example.com",
                now,
            )
            .unwrap();
        let jwt = header
            .strip_prefix("vapid t=")
            .unwrap()
            .split(", k=")
            .next()
            .unwrap();
        let claims: serde_json::Value =
            serde_json::from_slice(&b64::decode(jwt.split('.').nth(1).unwrap()).unwrap()).unwrap();

        assert_eq!(claims["aud"], "https://push.example");
        assert_eq!(claims["sub"], "mailto:ops@example.com");
        assert_eq!(claims["exp"], now + TOKEN_LIFETIME_SECS);
        // Well inside the RFC 8292 24-hour ceiling.
        assert!(claims["exp"].as_i64().unwrap() - now <= 24 * 60 * 60);
    }

    #[test]
    fn the_jwt_header_declares_es256() {
        let key = VapidKey::generate();
        let header = key
            .authorization("https://push.example/x", "mailto:a@b.c", 0)
            .unwrap();
        let jwt = header
            .strip_prefix("vapid t=")
            .unwrap()
            .split(", k=")
            .next()
            .unwrap();
        let jose: serde_json::Value =
            serde_json::from_slice(&b64::decode(jwt.split('.').next().unwrap()).unwrap()).unwrap();
        assert_eq!(jose["alg"], "ES256");
        assert_eq!(jose["typ"], "JWT");
    }
}
