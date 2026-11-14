use rsa::pkcs8::EncodePublicKey;
use serde_json::{json, Value};

use super::*;
use crate::services::sso::testing::signing::{
    ec_jwk, ec_key, ed25519_jwk, ed25519_key, jwks, p384_jwk, p384_key, rsa_jwk, rsa_key,
    sign_eddsa, sign_es256, sign_es384, sign_hs256, sign_rs256, stranger_rsa_key, unsigned,
    weak_rsa_key, KEY_ID,
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
fn an_es384_token_is_accepted_against_the_p384_key() {
    let keys = KeySet::parse(&jwks(&[p384_jwk(p384_key(), "p384")])).unwrap();
    let token = sign_es384(p384_key(), &json!({ "alg": "ES384", "kid": "p384" }), &claims());

    let verified = verify(&token, &keys, &expected());

    assert_eq!(verified.map(|v| v.subject), Ok("sub-lea".to_string()));
}

#[test]
fn an_eddsa_token_is_accepted_against_the_ed25519_key() {
    let keys = KeySet::parse(&jwks(&[ed25519_jwk(ed25519_key(), "ed")])).unwrap();
    let token = sign_eddsa(ed25519_key(), &json!({ "alg": "EdDSA", "kid": "ed" }), &claims());

    let verified = verify(&token, &keys, &expected());

    assert_eq!(verified.map(|v| v.subject), Ok("sub-lea".to_string()));
}

#[test]
fn a_signature_is_only_good_under_the_algorithm_its_key_is_for() {
    let keys = KeySet::parse(&jwks(&[
        ec_jwk(ec_key(), "p256"),
        p384_jwk(p384_key(), "p384"),
        ed25519_jwk(ed25519_key(), "ed"),
    ]))
    .unwrap();
    let crossed = sign_es384(p384_key(), &json!({ "alg": "ES256", "kid": "p384" }), &claims());
    let renamed = sign_eddsa(ed25519_key(), &json!({ "alg": "ES384", "kid": "ed" }), &claims());
    let header = json!({ "alg": "EdDSA", "kid": "ed" });
    let honest = sign_eddsa(ed25519_key(), &header, &claims());
    let other = sign_eddsa(ed25519_key(), &header, &with(json!({ "sub": "sub-leo" })));
    let (payload, signature) = (other.split('.').nth(1).unwrap(), honest.rsplit('.').next().unwrap());
    let changed = format!("{}.{payload}.{signature}", honest.split('.').next().unwrap());

    assert!(verify(&crossed, &keys, &expected()).is_err());
    assert!(verify(&renamed, &keys, &expected()).is_err());
    assert!(verify(&changed, &keys, &expected()).is_err());
}

#[test]
fn a_key_on_another_curve_than_its_algorithm_names_verifies_nothing() {
    let mut odd = p384_jwk(p384_key(), "p384");
    odd["crv"] = json!("P-521");
    let mut short = ed25519_jwk(ed25519_key(), "ed");
    short["crv"] = json!("Ed448");
    let keys = KeySet::parse(&jwks(&[odd, short])).unwrap();
    let es384 = sign_es384(p384_key(), &json!({ "alg": "ES384", "kid": "p384" }), &claims());
    let eddsa = sign_eddsa(ed25519_key(), &json!({ "alg": "EdDSA", "kid": "ed" }), &claims());

    assert_eq!(verify(&es384, &keys, &expected()), Err(TokenError::Signature));
    assert_eq!(verify(&eddsa, &keys, &expected()), Err(TokenError::Signature));
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
