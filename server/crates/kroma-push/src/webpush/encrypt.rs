//! RFC 8291 Message Encryption for Web Push, over the RFC 8188 `aes128gcm`
//! content encoding. Every constant string, `\0` separator and field width
//! below is wire format and not negotiable.

use aes_gcm::aead::Aead;
use aes_gcm::{Aes128Gcm, KeyInit, Nonce};
use anyhow::{bail, Context, Result};
use hkdf::Hkdf;
use p256::ecdh::diffie_hellman;
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::{PublicKey, SecretKey};
use sha2::Sha256;

const RECORD_SIZE: u32 = 4096;

// An uncompressed P-256 point: `0x04 || X(32) || Y(32)`.
const P256_POINT_LEN: usize = 65;

// GCM tag (16) + the one-byte padding delimiter this encoding appends.
const OVERHEAD: usize = 17;

pub const MAX_PAYLOAD: usize = RECORD_SIZE as usize - OVERHEAD;

/// Encrypt `payload` for a subscriber, with a fresh ephemeral key and salt.
/// `ua_public` is the subscription's `p256dh` and `auth_secret` its `auth`,
/// both already base64url-decoded.
pub fn encrypt(payload: &[u8], ua_public: &[u8], auth_secret: &[u8]) -> Result<Vec<u8>> {
    let ephemeral = SecretKey::random(&mut rand_core::OsRng);
    let mut salt = [0u8; 16];
    rand_core::RngCore::fill_bytes(&mut rand_core::OsRng, &mut salt);
    encrypt_with(payload, ua_public, auth_secret, &ephemeral, &salt)
}

/// [`encrypt`] with the two random inputs supplied, so a test can reproduce a
/// known-answer vector. Never call this with a fixed salt in production:
/// reusing a (key, nonce) pair is a total break of AES-GCM.
pub fn encrypt_with(
    payload: &[u8],
    ua_public: &[u8],
    auth_secret: &[u8],
    ephemeral: &SecretKey,
    salt: &[u8; 16],
) -> Result<Vec<u8>> {
    if payload.len() > MAX_PAYLOAD {
        bail!(
            "push payload is {} bytes; the cap is {MAX_PAYLOAD}",
            payload.len()
        );
    }
    if ua_public.len() != P256_POINT_LEN {
        bail!(
            "p256dh must be {P256_POINT_LEN} bytes, got {}",
            ua_public.len()
        );
    }

    let ua_key = PublicKey::from_sec1_bytes(ua_public).context("p256dh is not a P-256 point")?;
    let as_public_point = ephemeral.public_key().to_encoded_point(false);
    let as_public = as_public_point.as_bytes();

    // ECDH gives the raw x-coordinate of the shared point (RFC 8291 §3.1).
    let shared = diffie_hellman(ephemeral.to_nonzero_scalar(), ua_key.as_affine());
    let ecdh_secret = shared.raw_secret_bytes();

    // RFC 8291 §3.4: the auth secret is the HKDF *salt*, and both public keys
    // go in the info so a message can't be replayed at another subscriber.
    let mut key_info = Vec::with_capacity(14 + P256_POINT_LEN * 2);
    key_info.extend_from_slice(b"WebPush: info\0");
    key_info.extend_from_slice(ua_public);
    key_info.extend_from_slice(as_public);
    let mut ikm = [0u8; 32];
    Hkdf::<Sha256>::new(Some(auth_secret), ecdh_secret)
        .expand(&key_info, &mut ikm)
        .map_err(|_| anyhow::anyhow!("HKDF expand (IKM) failed"))?;

    // RFC 8188 §2.2: content key + nonce come from the record salt and that IKM.
    let content = Hkdf::<Sha256>::new(Some(salt), &ikm);
    let mut cek = [0u8; 16];
    content
        .expand(b"Content-Encoding: aes128gcm\0", &mut cek)
        .map_err(|_| anyhow::anyhow!("HKDF expand (CEK) failed"))?;
    let mut nonce = [0u8; 12];
    content
        .expand(b"Content-Encoding: nonce\0", &mut nonce)
        .map_err(|_| anyhow::anyhow!("HKDF expand (nonce) failed"))?;

    // A single record, so the delimiter is 0x02 ("last record"). 0x01 here would
    // make the browser wait for a continuation that never comes.
    let mut plaintext = Vec::with_capacity(payload.len() + 1);
    plaintext.extend_from_slice(payload);
    plaintext.push(0x02);

    let cipher = Aes128Gcm::new_from_slice(&cek).map_err(|_| anyhow::anyhow!("bad CEK length"))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_ref())
        .map_err(|_| anyhow::anyhow!("AES-128-GCM encryption failed"))?;

    // RFC 8188 §2.1 header, then the record.
    let mut body = Vec::with_capacity(21 + P256_POINT_LEN + ciphertext.len());
    body.extend_from_slice(salt);
    body.extend_from_slice(&RECORD_SIZE.to_be_bytes());
    body.push(P256_POINT_LEN as u8);
    body.extend_from_slice(as_public);
    body.extend_from_slice(&ciphertext);
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::b64;

    // Every value below is copied from RFC 8291 §5, "Push Message Encryption
    // Example".
    const PLAINTEXT: &str = "When I grow up, I want to be a watermelon";
    const UA_PUBLIC: &str =
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    const AUTH: &str = "BTBZMqHH6r4Tts7J_aSIgg";
    const AS_PRIVATE: &str = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    const AS_PUBLIC: &str =
        "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    const SALT: &str = "DGv6ra1nlYgDCS1FRnbzlw";
    const EXPECTED: &str = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlml\
MoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXL\
WyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

    fn vector_key() -> SecretKey {
        SecretKey::from_slice(&b64::decode(AS_PRIVATE).unwrap()).unwrap()
    }

    fn vector_salt() -> [u8; 16] {
        b64::decode(SALT).unwrap().try_into().unwrap()
    }

    #[test]
    fn reproduces_the_rfc_8291_published_vector_byte_for_byte() {
        let body = encrypt_with(
            PLAINTEXT.as_bytes(),
            &b64::decode(UA_PUBLIC).unwrap(),
            &b64::decode(AUTH).unwrap(),
            &vector_key(),
            &vector_salt(),
        )
        .unwrap();
        assert_eq!(b64::encode(&body), EXPECTED);
    }

    #[test]
    fn the_vector_private_key_yields_the_vector_public_key() {
        let public = vector_key().public_key().to_encoded_point(false);
        assert_eq!(b64::encode(public.as_bytes()), AS_PUBLIC);
    }

    #[test]
    fn the_header_block_is_laid_out_as_rfc_8188_requires() {
        let body = encrypt_with(
            PLAINTEXT.as_bytes(),
            &b64::decode(UA_PUBLIC).unwrap(),
            &b64::decode(AUTH).unwrap(),
            &vector_key(),
            &vector_salt(),
        )
        .unwrap();
        assert_eq!(&body[..16], &vector_salt()[..], "salt comes first");
        assert_eq!(
            &body[16..20],
            &RECORD_SIZE.to_be_bytes(),
            "then rs, big-endian"
        );
        assert_eq!(body[20], 65, "then the key id length");
        assert_eq!(
            &body[21..86],
            b64::decode(AS_PUBLIC).unwrap(),
            "then our public key"
        );
    }

    #[test]
    fn a_fresh_encryption_differs_every_time() {
        // Byte-identical output would mean the (key, nonce) pair is repeating.
        let ua = b64::decode(UA_PUBLIC).unwrap();
        let auth = b64::decode(AUTH).unwrap();
        let a = encrypt(PLAINTEXT.as_bytes(), &ua, &auth).unwrap();
        let b = encrypt(PLAINTEXT.as_bytes(), &ua, &auth).unwrap();
        assert_ne!(a, b);
        assert_eq!(a.len(), b.len());
        assert_eq!(a.len(), 21 + 65 + PLAINTEXT.len() + OVERHEAD);
    }

    #[test]
    fn rejects_a_payload_over_one_record() {
        let ua = b64::decode(UA_PUBLIC).unwrap();
        let auth = b64::decode(AUTH).unwrap();
        let err = encrypt(&vec![b'x'; MAX_PAYLOAD + 1], &ua, &auth).unwrap_err();
        assert!(err.to_string().contains("cap is"), "{err}");
        assert!(encrypt(&vec![b'x'; MAX_PAYLOAD], &ua, &auth).is_ok());
    }

    #[test]
    fn rejects_a_malformed_subscriber_key() {
        let auth = b64::decode(AUTH).unwrap();
        // Right length, not a curve point.
        let err = encrypt(b"hi", &[4u8; 65], &auth).unwrap_err();
        assert!(err.to_string().contains("P-256 point"), "{err}");
        let err = encrypt(b"hi", &[4u8; 32], &auth).unwrap_err();
        assert!(err.to_string().contains("65 bytes"), "{err}");
    }
}
