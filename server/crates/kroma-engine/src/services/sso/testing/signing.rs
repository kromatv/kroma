//! Keys and tokens for tests: what a provider would sign, and what an
//! attacker would.

use std::sync::LazyLock;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use p256::ecdsa::signature::Signer;
use rsa::pkcs1v15::SigningKey;
use rsa::signature::SignatureEncoding;
use rsa::traits::PublicKeyParts;
use rsa::RsaPrivateKey;
use serde_json::{json, Value};
use sha2::Sha256;

pub const KEY_ID: &str = "test-key";

fn generated(bits: usize) -> RsaPrivateKey {
    RsaPrivateKey::new(&mut rand_core::OsRng, bits).expect("generate an RSA key")
}

/// The provider's signing key, generated once per test binary.
pub fn rsa_key() -> &'static RsaPrivateKey {
    static KEY: LazyLock<RsaPrivateKey> = LazyLock::new(|| generated(2048));
    &KEY
}

/// A key the provider never published.
pub fn stranger_rsa_key() -> &'static RsaPrivateKey {
    static KEY: LazyLock<RsaPrivateKey> = LazyLock::new(|| generated(2048));
    &KEY
}

/// A key too short to be trusted.
pub fn weak_rsa_key() -> &'static RsaPrivateKey {
    static KEY: LazyLock<RsaPrivateKey> = LazyLock::new(|| generated(1024));
    &KEY
}

pub fn ec_key() -> &'static p256::ecdsa::SigningKey {
    static KEY: LazyLock<p256::ecdsa::SigningKey> =
        LazyLock::new(|| p256::ecdsa::SigningKey::random(&mut rand_core::OsRng));
    &KEY
}

pub fn p384_key() -> &'static ring::signature::EcdsaKeyPair {
    use ring::signature::{EcdsaKeyPair, ECDSA_P384_SHA384_FIXED_SIGNING};
    static KEY: LazyLock<EcdsaKeyPair> = LazyLock::new(|| {
        let rng = ring::rand::SystemRandom::new();
        let pkcs8 = EcdsaKeyPair::generate_pkcs8(&ECDSA_P384_SHA384_FIXED_SIGNING, &rng)
            .expect("generate a P-384 key");
        EcdsaKeyPair::from_pkcs8(&ECDSA_P384_SHA384_FIXED_SIGNING, pkcs8.as_ref(), &rng)
            .expect("read the P-384 key back")
    });
    &KEY
}

pub fn ed25519_key() -> &'static ring::signature::Ed25519KeyPair {
    use ring::signature::Ed25519KeyPair;
    static KEY: LazyLock<Ed25519KeyPair> = LazyLock::new(|| {
        let pkcs8 = Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new())
            .expect("generate an Ed25519 key");
        Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).expect("read the Ed25519 key back")
    });
    &KEY
}

fn b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn rsa_jwk(key: &RsaPrivateKey, kid: &str) -> Value {
    json!({
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": kid,
        "n": b64(&key.n().to_bytes_be()),
        "e": b64(&key.e().to_bytes_be()),
    })
}

pub fn ec_jwk(key: &p256::ecdsa::SigningKey, kid: &str) -> Value {
    let point = key.verifying_key().to_encoded_point(false);
    json!({
        "kty": "EC",
        "crv": "P-256",
        "kid": kid,
        "x": b64(point.x().expect("an x coordinate")),
        "y": b64(point.y().expect("a y coordinate")),
    })
}

pub fn p384_jwk(key: &ring::signature::EcdsaKeyPair, kid: &str) -> Value {
    use ring::signature::KeyPair;
    let point = key.public_key().as_ref();
    json!({
        "kty": "EC",
        "crv": "P-384",
        "kid": kid,
        "x": b64(&point[1..49]),
        "y": b64(&point[49..]),
    })
}

pub fn ed25519_jwk(key: &ring::signature::Ed25519KeyPair, kid: &str) -> Value {
    use ring::signature::KeyPair;
    json!({
        "kty": "OKP",
        "crv": "Ed25519",
        "kid": kid,
        "x": b64(key.public_key().as_ref()),
    })
}

pub fn jwks(keys: &[Value]) -> Vec<u8> {
    json!({ "keys": keys }).to_string().into_bytes()
}

fn signing_input(header: &Value, claims: &Value) -> String {
    format!(
        "{}.{}",
        b64(header.to_string().as_bytes()),
        b64(claims.to_string().as_bytes())
    )
}

pub fn sign_rs256(key: &RsaPrivateKey, header: &Value, claims: &Value) -> String {
    let input = signing_input(header, claims);
    let signature = rsa::signature::Signer::sign(
        &SigningKey::<Sha256>::new(key.clone()),
        input.as_bytes(),
    );
    format!("{input}.{}", b64(&signature.to_bytes()))
}

pub fn sign_es256(key: &p256::ecdsa::SigningKey, header: &Value, claims: &Value) -> String {
    let input = signing_input(header, claims);
    let signature: p256::ecdsa::Signature = key.sign(input.as_bytes());
    format!("{input}.{}", b64(&signature.to_bytes()))
}

pub fn sign_es384(key: &ring::signature::EcdsaKeyPair, header: &Value, claims: &Value) -> String {
    let input = signing_input(header, claims);
    let signature = key
        .sign(&ring::rand::SystemRandom::new(), input.as_bytes())
        .expect("sign with the P-384 key");
    format!("{input}.{}", b64(signature.as_ref()))
}

pub fn sign_eddsa(key: &ring::signature::Ed25519KeyPair, header: &Value, claims: &Value) -> String {
    let input = signing_input(header, claims);
    format!("{input}.{}", b64(key.sign(input.as_bytes()).as_ref()))
}

/// A token keyed with a shared secret: what an attacker builds from the
/// provider's PUBLIC key, hoping the verifier reads it as an HMAC secret.
pub fn sign_hs256(secret: &[u8], header: &Value, claims: &Value) -> String {
    let input = signing_input(header, claims);
    let mac = crate::services::auth::hmac_sha256(secret, input.as_bytes());
    format!("{input}.{}", b64(&mac))
}

/// A token nobody signed.
pub fn unsigned(header: &Value, claims: &Value) -> String {
    format!("{}.", signing_input(header, claims))
}
