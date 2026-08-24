//! The JWT shapes the push services ask for.
//!
//! Two algorithms, because the two vendors chose differently: Apple signs its
//! auth tokens ES256 (the same P-256 primitives VAPID uses), Google signs its
//! service-account assertions RS256. Both are "two base64url JSON segments, a
//! dot, a signature over them", so the encoding lives here once.

use anyhow::Result;
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use p256::SecretKey;
use rsa::pkcs1v15::SigningKey as RsaSigningKey;
use rsa::signature::SignatureEncoding;
use rsa::RsaPrivateKey;
use sha2::Sha256;

use crate::b64;

/// Sign `header` + `claims` (both JSON) as an ES256 JWT.
///
/// JOSE wants the fixed-width `r || s` pair, NOT the DER encoding most ECDSA
/// APIs hand back by default a DER signature is silently rejected by Apple.
pub fn sign_es256(
    key: &SecretKey,
    header: &serde_json::Value,
    claims: &serde_json::Value,
) -> String {
    let signing_input = format!(
        "{}.{}",
        b64::encode(header.to_string()),
        b64::encode(claims.to_string())
    );
    let signature: Signature = SigningKey::from(key).sign(signing_input.as_bytes());
    format!("{signing_input}.{}", b64::encode(signature.to_bytes()))
}

/// Sign `header` + `claims` as an RS256 JWT (Google service accounts).
pub fn sign_rs256(
    key: &RsaPrivateKey,
    header: &serde_json::Value,
    claims: &serde_json::Value,
) -> Result<String> {
    let signing_input = format!(
        "{}.{}",
        b64::encode(header.to_string()),
        b64::encode(claims.to_string())
    );
    let signing_key = RsaSigningKey::<Sha256>::new(key.clone());
    let signature = rsa::signature::Signer::sign(&signing_key, signing_input.as_bytes());
    Ok(format!(
        "{signing_input}.{}",
        b64::encode(signature.to_bytes())
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::signature::Verifier;
    use p256::ecdsa::VerifyingKey;
    use serde_json::json;

    #[test]
    fn es256_produces_three_segments_and_a_raw_64_byte_signature() {
        let key = SecretKey::random(&mut rand_core::OsRng);
        let jwt = sign_es256(
            &key,
            &json!({ "alg": "ES256", "kid": "K" }),
            &json!({ "iss": "T" }),
        );
        let parts: Vec<&str> = jwt.split('.').collect();
        assert_eq!(parts.len(), 3);
        // JOSE r||s, not DER (which would be ~70 bytes and start 0x30).
        assert_eq!(b64::decode(parts[2]).unwrap().len(), 64);
    }

    #[test]
    fn an_es256_signature_verifies_over_the_signing_input() {
        let key = SecretKey::random(&mut rand_core::OsRng);
        let jwt = sign_es256(&key, &json!({ "alg": "ES256" }), &json!({ "iss": "team" }));
        let parts: Vec<&str> = jwt.split('.').collect();
        let verifying = VerifyingKey::from(SigningKey::from(&key));
        let sig = Signature::from_slice(&b64::decode(parts[2]).unwrap()).unwrap();
        let signed = format!("{}.{}", parts[0], parts[1]);
        assert!(verifying.verify(signed.as_bytes(), &sig).is_ok());
    }

    #[test]
    fn es256_segments_decode_back_to_the_json_they_were_given() {
        let key = SecretKey::random(&mut rand_core::OsRng);
        let jwt = sign_es256(
            &key,
            &json!({ "alg": "ES256", "kid": "ABC123" }),
            &json!({ "iss": "T", "iat": 5 }),
        );
        let parts: Vec<&str> = jwt.split('.').collect();
        let header: serde_json::Value =
            serde_json::from_slice(&b64::decode(parts[0]).unwrap()).unwrap();
        let claims: serde_json::Value =
            serde_json::from_slice(&b64::decode(parts[1]).unwrap()).unwrap();
        assert_eq!(header["kid"], "ABC123");
        assert_eq!(claims["iat"], 5);
    }

    #[test]
    fn rs256_verifies_against_the_matching_public_key() {
        use rsa::pkcs1v15::VerifyingKey as RsaVerifyingKey;
        use rsa::signature::Verifier as RsaVerifier;

        // 2048 is what Google issues; smaller would not exercise the real path.
        let key = RsaPrivateKey::new(&mut rand_core::OsRng, 2048).unwrap();
        let jwt = sign_rs256(
            &key,
            &json!({ "alg": "RS256", "typ": "JWT" }),
            &json!({ "iss": "sa" }),
        )
        .unwrap();
        let parts: Vec<&str> = jwt.split('.').collect();
        assert_eq!(parts.len(), 3);

        let verifying = RsaVerifyingKey::<Sha256>::new(key.to_public_key());
        let sig =
            rsa::pkcs1v15::Signature::try_from(b64::decode(parts[2]).unwrap().as_slice()).unwrap();
        let signed = format!("{}.{}", parts[0], parts[1]);
        assert!(RsaVerifier::verify(&verifying, signed.as_bytes(), &sig).is_ok());
    }
}
