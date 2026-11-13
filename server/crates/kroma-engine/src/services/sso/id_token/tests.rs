use rsa::pkcs8::EncodePublicKey;
use serde_json::{json, Value};

use super::*;
use crate::services::sso::testing::signing::{
    ec_jwk, ec_key, jwks, rsa_jwk, rsa_key, sign_es256, sign_hs256, sign_rs256, stranger_rsa_key,
    unsigned, weak_rsa_key, KEY_ID,
};

const ISSUER: &str = "https://id.test";
const CLIENT: &str = "kroma";
const NONCE: &str = "n-0S6_WzA2Mj";
const NOW: i64 = 1_800_000_000;

fn expected() -> Expected<'static> {
    Expected {
        issuer: ISSUER,
        client_id: CLIENT,
        nonce: NONCE,
        now: NOW,
    }
}

fn claims() -> Value {
    json!({
        "iss": ISSUER,
        "aud": CLIENT,
        "sub": "sub-lea",
        "exp": NOW + 300,
        "iat": NOW,
        "nonce": NONCE,
        "email": "lea@id.test",
    })
}

fn with(patch: Value) -> Value {
    let mut claims = claims();
    for (key, value) in patch.as_object().unwrap() {
        if value.is_null() {
            claims.as_object_mut().unwrap().remove(key);
        } else {
            claims[key] = value.clone();
        }
    }
    claims
}

fn rs256_header() -> Value {
    json!({ "alg": "RS256", "typ": "JWT", "kid": KEY_ID })
}

fn published() -> KeySet {
    KeySet::parse(&jwks(&[rsa_jwk(rsa_key(), KEY_ID), ec_jwk(ec_key(), "ec")])).unwrap()
}

fn signed(claims: &Value) -> String {
    sign_rs256(rsa_key(), &rs256_header(), claims)
}

fn refusal(claims: &Value) -> TokenError {
    verify(&signed(claims), &published(), &expected()).unwrap_err()
}

#[test]
fn a_token_the_provider_signed_for_this_sign_in_is_accepted() {
    let token = signed(&claims());

    let verified = verify(&token, &published(), &expected()).unwrap();

    assert_eq!(verified.subject, "sub-lea");
    assert_eq!(verified.claims["email"], "lea@id.test");
}

#[test]
fn an_es256_token_is_accepted_against_the_ec_key() {
    let header = json!({ "alg": "ES256", "kid": "ec" });
    let token = sign_es256(ec_key(), &header, &claims());

    let verified = verify(&token, &published(), &expected());

    assert_eq!(verified.map(|v| v.subject), Ok("sub-lea".to_string()));
}

#[test]
fn a_token_that_names_no_key_is_checked_against_every_published_one() {
    let token = sign_rs256(rsa_key(), &json!({ "alg": "RS256" }), &claims());

    assert!(verify(&token, &published(), &expected()).is_ok());
}

#[test]
fn a_token_nobody_signed_is_refused() {
    let token = unsigned(&json!({ "alg": "none" }), &claims());

    let refused = verify(&token, &published(), &expected());

    assert_eq!(refused, Err(TokenError::Algorithm));
}

#[test]
fn a_token_keyed_with_the_public_key_as_an_hmac_secret_is_refused() {
    let public_pem = rsa_key()
        .to_public_key()
        .to_public_key_pem(Default::default())
        .unwrap();
    let header = json!({ "alg": "HS256", "kid": KEY_ID });
    let token = sign_hs256(public_pem.as_bytes(), &header, &claims());

    let refused = verify(&token, &published(), &expected());

    assert_eq!(refused, Err(TokenError::Algorithm));
}

#[test]
fn a_token_signed_by_a_key_the_provider_never_published_is_refused() {
    let token = sign_rs256(stranger_rsa_key(), &rs256_header(), &claims());

    let refused = verify(&token, &published(), &expected());

    assert_eq!(refused, Err(TokenError::Signature));
}

#[test]
fn a_token_naming_an_unpublished_key_says_so() {
    let header = json!({ "alg": "RS256", "kid": "rotated" });
    let token = sign_rs256(rsa_key(), &header, &claims());

    let refused = verify(&token, &published(), &expected());

    assert_eq!(refused, Err(TokenError::UnknownKey));
}

#[test]
fn a_payload_changed_after_signing_is_refused() {
    let token = signed(&claims());
    let forged_payload = signed(&with(json!({ "sub": "sub-owner" })));
    let mut parts: Vec<&str> = token.split('.').collect();
    parts[1] = forged_payload.split('.').nth(1).unwrap();

    let refused = verify(&parts.join("."), &published(), &expected());

    assert_eq!(refused, Err(TokenError::Signature));
}

#[test]
fn a_key_shorter_than_2048_bits_verifies_nothing() {
    let keys = KeySet::parse(&jwks(&[rsa_jwk(weak_rsa_key(), KEY_ID)])).unwrap();
    let token = sign_rs256(weak_rsa_key(), &rs256_header(), &claims());

    let refused = verify(&token, &keys, &expected());

    assert_eq!(refused, Err(TokenError::Signature));
}

#[test]
fn an_encryption_key_in_the_set_signs_nothing() {
    let mut key = rsa_jwk(rsa_key(), KEY_ID);
    key["use"] = json!("enc");
    let keys = KeySet::parse(&jwks(&[key, json!({ "kty": "oct", "k": "AAAA" })])).unwrap();

    let refused = verify(&signed(&claims()), &keys, &expected());

    assert_eq!(refused, Err(TokenError::UnknownKey));
}

#[test]
fn a_token_from_another_issuer_is_refused() {
    assert_eq!(
        refusal(&with(json!({ "iss": "https://evil.test" }))),
        TokenError::Issuer
    );
    assert_eq!(refusal(&with(json!({ "iss": null }))), TokenError::Issuer);
}

#[test]
fn a_token_minted_for_another_client_is_refused() {
    assert_eq!(
        refusal(&with(json!({ "aud": "another-app" }))),
        TokenError::Audience
    );
    assert_eq!(refusal(&with(json!({ "aud": null }))), TokenError::Audience);
    assert_eq!(
        refusal(&with(json!({ "aud": ["another-app", "third"] }))),
        TokenError::Audience
    );
}

#[test]
fn a_token_shared_between_audiences_must_name_this_client_as_the_authorized_party() {
    let shared = json!({ "aud": [CLIENT, "another-app"] });
    assert_eq!(refusal(&with(shared.clone())), TokenError::Audience);

    let mut named = with(shared);
    named["azp"] = json!(CLIENT);
    assert!(verify(&signed(&named), &published(), &expected()).is_ok());

    assert_eq!(
        refusal(&with(json!({ "azp": "another-app" }))),
        TokenError::Audience
    );
}

#[test]
fn an_expired_token_is_refused_once_the_clock_skew_is_spent() {
    let just_expired = with(json!({ "exp": NOW - CLOCK_SKEW_SECS + 1 }));
    assert!(verify(&signed(&just_expired), &published(), &expected()).is_ok());

    assert_eq!(
        refusal(&with(json!({ "exp": NOW - CLOCK_SKEW_SECS }))),
        TokenError::Expired
    );
    assert_eq!(refusal(&with(json!({ "exp": null }))), TokenError::Expired);
    assert_eq!(
        refusal(&with(json!({ "exp": "tomorrow" }))),
        TokenError::Expired
    );
}

#[test]
fn a_token_from_the_future_is_refused() {
    assert_eq!(
        refusal(&with(json!({ "iat": NOW + CLOCK_SKEW_SECS + 1 }))),
        TokenError::NotYetValid
    );
    assert_eq!(
        refusal(&with(json!({ "nbf": NOW + CLOCK_SKEW_SECS + 1 }))),
        TokenError::NotYetValid
    );
}

#[test]
fn a_token_answering_another_sign_in_is_refused() {
    assert_eq!(
        refusal(&with(json!({ "nonce": "someone-elses" }))),
        TokenError::Nonce
    );
    assert_eq!(refusal(&with(json!({ "nonce": null }))), TokenError::Nonce);
}

#[test]
fn a_token_that_names_nobody_is_refused() {
    assert_eq!(refusal(&with(json!({ "sub": "" }))), TokenError::Subject);
    assert_eq!(refusal(&with(json!({ "sub": null }))), TokenError::Subject);
    assert_eq!(refusal(&with(json!({ "sub": 42 }))), TokenError::Subject);
    assert_eq!(
        refusal(&with(json!({ "sub": "x".repeat(256) }))),
        TokenError::Subject
    );
}

#[test]
fn anything_that_is_not_three_readable_segments_is_malformed() {
    let token = signed(&claims());
    let critical = sign_rs256(
        rsa_key(),
        &json!({ "alg": "RS256", "kid": KEY_ID, "crit": ["exp"] }),
        &claims(),
    );

    for broken in [
        String::new(),
        "one.two".to_string(),
        format!("{token}.extra"),
        "!!!.e30.sig".to_string(),
        format!("e30.{}", token.split_once('.').unwrap().1),
        "x".repeat(MAX_TOKEN_BYTES + 1),
        critical,
    ] {
        assert_eq!(
            verify(&broken, &published(), &expected()),
            Err(TokenError::Malformed),
            "{}",
            &broken[..broken.len().min(40)]
        );
    }
}

#[test]
fn a_key_set_that_is_not_one_does_not_parse() {
    assert!(KeySet::parse(b"not json").is_none());
    assert!(KeySet::parse(b"{}").is_none());
    assert!(KeySet::parse(br#"{"keys":[]}"#).is_some());
}
