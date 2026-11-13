//! A provider's published signing keys, and the check of one signature
//! against them.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use p256::ecdsa::signature::Verifier;
use rsa::traits::PublicKeyParts;
use rsa::{BigUint, RsaPublicKey};
use serde::Deserialize;
use sha2::Sha256;

const MIN_RSA_BITS: usize = 2048;

/// The two algorithms an ID token may be signed with. The list is closed:
/// `none` and the HMAC family never parse, whatever a provider advertises.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Algorithm {
    Rs256,
    Es256,
}

impl Algorithm {
    pub fn parse(alg: &str) -> Option<Algorithm> {
        match alg {
            "RS256" => Some(Algorithm::Rs256),
            "ES256" => Some(Algorithm::Es256),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Algorithm::Rs256 => "RS256",
            Algorithm::Es256 => "ES256",
        }
    }

    fn key_type(self) -> &'static str {
        match self {
            Algorithm::Rs256 => "RSA",
            Algorithm::Es256 => "EC",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignatureError {
    /// No published key could have made this signature.
    UnknownKey,
    Invalid,
}

#[derive(Debug, Clone, Deserialize)]
struct Jwk {
    kty: String,
    kid: Option<String>,
    #[serde(rename = "use")]
    usage: Option<String>,
    alg: Option<String>,
    n: Option<String>,
    e: Option<String>,
    crv: Option<String>,
    x: Option<String>,
    y: Option<String>,
}

impl Jwk {
    fn signs(&self, alg: Algorithm, kid: Option<&str>) -> bool {
        self.kty == alg.key_type()
            && self.usage.as_deref().is_none_or(|usage| usage == "sig")
            && self.alg.as_deref().is_none_or(|own| own == alg.as_str())
            && kid.is_none_or(|kid| self.kid.as_deref() == Some(kid))
    }

    fn accepts(&self, alg: Algorithm, signed: &[u8], signature: &[u8]) -> bool {
        match alg {
            Algorithm::Rs256 => self.accepts_rs256(signed, signature),
            Algorithm::Es256 => self.accepts_es256(signed, signature),
        }
    }

    fn accepts_rs256(&self, signed: &[u8], signature: &[u8]) -> bool {
        let (Some(n), Some(e)) = (decoded(&self.n), decoded(&self.e)) else {
            return false;
        };
        let Ok(key) = RsaPublicKey::new(BigUint::from_bytes_be(&n), BigUint::from_bytes_be(&e))
        else {
            return false;
        };
        if key.size() * 8 < MIN_RSA_BITS {
            return false;
        }
        let Ok(signature) = rsa::pkcs1v15::Signature::try_from(signature) else {
            return false;
        };
        rsa::pkcs1v15::VerifyingKey::<Sha256>::new(key)
            .verify(signed, &signature)
            .is_ok()
    }

    fn accepts_es256(&self, signed: &[u8], signature: &[u8]) -> bool {
        if self.crv.as_deref() != Some("P-256") {
            return false;
        }
        let (Some(x), Some(y)) = (coordinate(&self.x), coordinate(&self.y)) else {
            return false;
        };
        let point = p256::EncodedPoint::from_affine_coordinates(&x.into(), &y.into(), false);
        let Ok(key) = p256::ecdsa::VerifyingKey::from_encoded_point(&point) else {
            return false;
        };
        let Ok(signature) = p256::ecdsa::Signature::from_slice(signature) else {
            return false;
        };
        key.verify(signed, &signature).is_ok()
    }
}

fn decoded(field: &Option<String>) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(field.as_deref()?.trim_end_matches('=')).ok()
}

fn coordinate(field: &Option<String>) -> Option<[u8; 32]> {
    decoded(field)?.try_into().ok()
}

/// The key set a provider serves at its `jwks_uri`.
#[derive(Debug, Clone, Default)]
pub struct KeySet {
    keys: Vec<Jwk>,
}

impl KeySet {
    /// A key this server cannot use (another type, a field missing) is skipped
    /// and not an error: providers publish encryption keys in the same set.
    pub fn parse(body: &[u8]) -> Option<KeySet> {
        #[derive(Deserialize)]
        struct Document {
            keys: Vec<serde_json::Value>,
        }
        let document: Document = serde_json::from_slice(body).ok()?;
        Some(KeySet {
            keys: document
                .keys
                .into_iter()
                .filter_map(|key| serde_json::from_value(key).ok())
                .collect(),
        })
    }

    /// Whether `signature` over `signed` was made by one of these keys. A token
    /// that names its key is checked against that key alone.
    pub fn verify(
        &self,
        alg: Algorithm,
        kid: Option<&str>,
        signed: &[u8],
        signature: &[u8],
    ) -> Result<(), SignatureError> {
        let mut candidates = self.keys.iter().filter(|key| key.signs(alg, kid)).peekable();
        if candidates.peek().is_none() {
            return Err(SignatureError::UnknownKey);
        }
        if candidates.any(|key| key.accepts(alg, signed, signature)) {
            Ok(())
        } else {
            Err(SignatureError::Invalid)
        }
    }
}
