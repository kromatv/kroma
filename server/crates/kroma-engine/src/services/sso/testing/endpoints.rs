//! The provider's HTTP endpoints: discovery, keys, the token endpoint and user
//! info.

use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use rsa::pkcs8::EncodePublicKey;
use serde_json::{json, Map, Value};

use super::provider::{now, Forgery, Shared, CLIENT_ID, CLIENT_SECRET};
use super::signing::{
    rsa_jwk, rsa_key, sign_hs256, sign_rs256, stranger_rsa_key, unsigned, KEY_ID,
};
use crate::services::auth::random_token;
use crate::services::sso::flows::challenge_of;

pub(super) async fn discovery(State(shared): State<Arc<Shared>>) -> Json<Value> {
    let mut book = shared.book.lock().expect("the provider's book");
    book.calls.push("discovery".into());
    let issuer = &shared.issuer;
    let methods = if book.posts_its_secret {
        json!(["client_secret_post"])
    } else {
        json!(["client_secret_basic", "client_secret_post"])
    };
    Json(json!({
        "issuer": issuer,
        "authorization_endpoint": format!("{issuer}/authorize"),
        "token_endpoint": format!("{issuer}/token"),
        "jwks_uri": format!("{issuer}/jwks"),
        "userinfo_endpoint": format!("{issuer}/userinfo"),
        "scopes_supported": book.scopes,
        "token_endpoint_auth_methods_supported": methods,
        "id_token_signing_alg_values_supported": ["RS256"],
    }))
}

pub(super) async fn keys(State(shared): State<Arc<Shared>>) -> Json<Value> {
    let mut book = shared.book.lock().expect("the provider's book");
    book.calls.push("keys".into());
    Json(json!({ "keys": [rsa_jwk(rsa_key(), &book.key_id)] }))
}

fn refused(error: &str) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": error }))).into_response()
}

fn client_credentials(headers: &HeaderMap, form: &HashMap<String, String>) -> (String, String) {
    let basic = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Basic "))
        .and_then(|encoded| STANDARD.decode(encoded).ok())
        .and_then(|bytes| String::from_utf8(bytes).ok());
    match basic {
        Some(pair) => {
            let (id, secret) = pair.split_once(':').unwrap_or((&pair, ""));
            let plain = |part: &str| {
                form_urlencoded::parse(part.as_bytes())
                    .next()
                    .map(|(k, _)| k.into_owned())
                    .unwrap_or_default()
            };
            (plain(id), plain(secret))
        }
        None => (
            form.get("client_id").cloned().unwrap_or_default(),
            form.get("client_secret").cloned().unwrap_or_default(),
        ),
    }
}

pub(super) async fn token(State(shared): State<Arc<Shared>>, headers: HeaderMap, body: String) -> Response {
    let form: HashMap<String, String> = form_urlencoded::parse(body.as_bytes())
        .into_owned()
        .collect();
    let mut book = shared.book.lock().expect("the provider's book");
    book.calls.push("token".into());
    let sent_in_header = headers.contains_key(header::AUTHORIZATION);
    if book.posts_its_secret && sent_in_header {
        return refused("invalid_client");
    }
    if client_credentials(&headers, &form) != (CLIENT_ID.to_string(), CLIENT_SECRET.to_string()) {
        return refused("invalid_client");
    }
    let Some(grant) = form.get("code").and_then(|code| book.grants.remove(code)) else {
        return refused("invalid_grant");
    };
    let verifier = form.get("code_verifier").map_or("", String::as_str);
    if challenge_of(verifier) != grant.challenge
        || form.get("redirect_uri") != Some(&grant.redirect_uri)
        || form.get("grant_type").map(String::as_str) != Some("authorization_code")
    {
        return refused("invalid_grant");
    }

    let access_token = random_token();
    let subject = grant.claims.get("sub").cloned().unwrap_or(json!("nobody"));
    let mut user_info = grant.claims.clone();
    user_info.insert("sub".into(), subject.clone());
    book.user_info.insert(access_token.clone(), user_info);

    let forgery = std::mem::take(&mut book.forgery);
    let mut claims = if book.claims_in_user_info_only {
        Map::new()
    } else {
        grant.claims
    };
    let aud = if forgery == Forgery::WrongAudience { "another-app" } else { CLIENT_ID };
    let iss = if forgery == Forgery::WrongIssuer { "https://evil.test" } else { &shared.issuer };
    let nonce = if forgery == Forgery::WrongNonce { "someone-elses" } else { &grant.nonce };
    let exp = if forgery == Forgery::Expired { now() - 3600 } else { now() + 300 };
    claims.insert("sub".into(), subject);
    claims.insert("iss".into(), json!(iss));
    claims.insert("aud".into(), json!(aud));
    claims.insert("nonce".into(), json!(nonce));
    claims.insert("exp".into(), json!(exp));
    claims.insert("iat".into(), json!(now()));
    let claims = Value::Object(claims);

    if forgery == Forgery::RotatedKey {
        book.key_id = "rotated".to_string();
    }
    let header = json!({ "alg": "RS256", "typ": "JWT", "kid": book.key_id });
    let id_token = match forgery {
        Forgery::Unsigned => unsigned(&json!({ "alg": "none" }), &claims),
        Forgery::HmacWithThePublicKey => {
            let public = rsa_key()
                .to_public_key()
                .to_public_key_pem(Default::default())
                .expect("the public key as PEM");
            sign_hs256(public.as_bytes(), &json!({ "alg": "HS256", "kid": KEY_ID }), &claims)
        }
        Forgery::StrangerKey => sign_rs256(stranger_rsa_key(), &header, &claims),
        _ => sign_rs256(rsa_key(), &header, &claims),
    };
    Json(json!({
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": 300,
        "id_token": id_token,
    }))
    .into_response()
}

pub(super) async fn user_info(State(shared): State<Arc<Shared>>, headers: HeaderMap) -> Response {
    let mut book = shared.book.lock().expect("the provider's book");
    book.calls.push("userinfo".into());
    let known = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .and_then(|token| book.user_info.get(token).cloned());
    match known {
        Some(claims) => Json(Value::Object(claims)).into_response(),
        None => StatusCode::UNAUTHORIZED.into_response(),
    }
}
