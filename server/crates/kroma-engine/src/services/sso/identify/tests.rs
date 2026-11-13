use serde_json::{json, Value};

use super::*;
use crate::services::sso::discovery::discover;
use crate::services::sso::flows::{Flows, Intent, NewFlow};
use crate::services::sso::testing::{FakeProvider, Forgery};

const REDIRECT: &str = "https://kroma.test/api/auth/sso/callback";

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn lea() -> Value {
    json!({
        "sub": "sub-lea",
        "preferred_username": "lea",
        "email": "lea@id.test",
        "name": "Léa",
        "groups": ["family"],
    })
}

struct Round {
    idp: FakeProvider,
    provider: Provider,
    directory: Directory,
    flows: Flows,
}

impl Round {
    fn new() -> Round {
        let idp = FakeProvider::start();
        Round {
            provider: idp.settings("p0"),
            idp,
            directory: Directory::default(),
            flows: Flows::default(),
        }
    }

    fn authorize(&self) -> (Started, String) {
        let started = self
            .flows
            .start(
                NewFlow {
                    provider_id: "p0".into(),
                    fingerprint: self.provider.fingerprint(),
                    intent: Intent::SignIn { invite: None },
                    origin: "https://kroma.test".into(),
                    redirect_uri: REDIRECT.into(),
                },
                "10.0.0.1",
                now(),
            )
            .unwrap();
        let (metadata, _) = self.directory.lookup(&self.provider.issuer, now()).unwrap();
        let url = authorize_url(&metadata, &self.provider, &started, REDIRECT);
        (started, url)
    }

    fn sign_in(&self, claims: Value) -> Result<Identity, IdentifyError> {
        self.sign_in_at(claims, now())
    }

    fn sign_in_at(&self, claims: Value, at: i64) -> Result<Identity, IdentifyError> {
        let (started, url) = self.authorize();
        let back = self.idp.approve(&url, claims);
        let code = back.split("code=").nth(1).unwrap().split('&').next().unwrap();
        let flow = self.flows.arrive(&started.state, now()).unwrap();
        identify(&self.directory, &self.provider, &flow, code, at)
    }

    fn forged(&self, forgery: Forgery) -> Result<Identity, IdentifyError> {
        self.idp.forge(forgery);
        self.sign_in(lea())
    }
}

#[test]
fn a_person_who_signs_in_at_the_provider_comes_back_as_themselves() {
    let round = Round::new();

    let identity = round.sign_in(lea()).unwrap();

    assert_eq!(identity.issuer, round.idp.issuer);
    assert_eq!(identity.person.subject, "sub-lea");
    assert_eq!(identity.person.email.as_deref(), Some("lea@id.test"));
    assert_eq!(identity.person.groups, ["family"]);
    assert!(!round.idp.calls().contains(&"userinfo".to_string()));
}

#[test]
fn the_provider_is_read_once_and_remembered() {
    let round = Round::new();

    round.sign_in(lea()).unwrap();
    round.sign_in(lea()).unwrap();

    let calls = round.idp.calls();
    assert_eq!(calls.iter().filter(|c| *c == "discovery").count(), 1);
    assert_eq!(calls.iter().filter(|c| *c == "keys").count(), 1);
}

#[test]
fn every_forged_token_is_refused() {
    let round = Round::new();

    for (forgery, error) in [
        (Forgery::Unsigned, TokenError::Algorithm),
        (Forgery::HmacWithThePublicKey, TokenError::Algorithm),
        (Forgery::StrangerKey, TokenError::Signature),
        (Forgery::WrongAudience, TokenError::Audience),
        (Forgery::WrongIssuer, TokenError::Issuer),
        (Forgery::WrongNonce, TokenError::Nonce),
        (Forgery::Expired, TokenError::Expired),
    ] {
        assert_eq!(
            round.forged(forgery),
            Err(IdentifyError::Token(error)),
            "{forgery:?}"
        );
    }
}

#[test]
fn a_code_is_redeemed_once() {
    let round = Round::new();
    let (started, url) = round.authorize();
    let back = round.idp.approve(&url, lea());
    let code = back.split("code=").nth(1).unwrap().split('&').next().unwrap();
    let flow = round.flows.arrive(&started.state, now()).unwrap();
    identify(&round.directory, &round.provider, &flow, code, now()).unwrap();

    let replayed = identify(&round.directory, &round.provider, &flow, code, now());

    assert_eq!(
        replayed,
        Err(IdentifyError::Exchange(ExchangeError::Refused(
            400,
            Some("invalid_grant".into())
        )))
    );
}

#[test]
fn a_code_cannot_be_redeemed_by_a_flow_that_did_not_ask_for_it() {
    let round = Round::new();
    let (_, url) = round.authorize();
    let back = round.idp.approve(&url, lea());
    let code = back.split("code=").nth(1).unwrap().split('&').next().unwrap();
    let (other, _) = round.authorize();
    let thief = round.flows.arrive(&other.state, now()).unwrap();

    let stolen = identify(&round.directory, &round.provider, &thief, code, now());

    assert!(matches!(
        stolen,
        Err(IdentifyError::Exchange(ExchangeError::Refused(400, _)))
    ));
}

#[test]
fn a_wrong_client_secret_is_the_providers_refusal() {
    let mut round = Round::new();
    round.provider.client_secret = "wrong".into();

    let refused = round.sign_in(lea());

    assert_eq!(
        refused,
        Err(IdentifyError::Exchange(ExchangeError::Refused(
            400,
            Some("invalid_client".into())
        )))
    );
}

#[test]
fn the_secret_goes_in_the_body_for_a_provider_that_takes_it_only_there() {
    let round = Round::new();
    round.idp.accept_the_secret_in_the_body_only();

    assert!(round.sign_in(lea()).is_ok());
}

#[test]
fn keys_rotated_since_they_were_read_are_read_again() {
    let round = Round::new();
    round.sign_in(lea()).unwrap();
    round.idp.forge(Forgery::RotatedKey);

    let after_rotation = round.sign_in_at(lea(), now() + 61);

    assert!(after_rotation.is_ok());
    let calls = round.idp.calls();
    assert_eq!(calls.iter().filter(|c| *c == "keys").count(), 2);
}

#[test]
fn an_unknown_key_does_not_refetch_the_keys_more_than_once_a_minute() {
    let round = Round::new();
    round.sign_in(lea()).unwrap();

    let too_soon = round.forged(Forgery::RotatedKey);

    assert_eq!(too_soon, Err(IdentifyError::Token(TokenError::UnknownKey)));
    let calls = round.idp.calls();
    assert_eq!(calls.iter().filter(|c| *c == "keys").count(), 1);
}

#[test]
fn claims_the_token_left_out_come_from_user_info() {
    let round = Round::new();
    round.idp.keep_claims_for_user_info();

    let identity = round.sign_in(lea()).unwrap();

    assert_eq!(identity.person.email.as_deref(), Some("lea@id.test"));
    assert_eq!(identity.person.groups, ["family"]);
    assert!(round.idp.calls().contains(&"userinfo".to_string()));
}

#[test]
fn groups_are_asked_for_when_the_provider_offers_the_scope() {
    let plain = Round::new();
    let with_groups = Round::new();
    with_groups.idp.offer_scope("groups");

    let (_, plain_url) = plain.authorize();
    let (_, groups_url) = with_groups.authorize();

    assert_eq!(plain.idp.scope_asked(&plain_url), "openid profile email");
    assert_eq!(
        with_groups.idp.scope_asked(&groups_url),
        "openid profile email groups"
    );
}

#[test]
fn the_authorize_address_keeps_a_query_the_provider_already_had() {
    let round = Round::new();
    let (mut metadata, _) = round.directory.lookup(&round.provider.issuer, now()).unwrap();
    metadata.authorization_endpoint.push_str("?tenant=home");
    let (started, _) = round.authorize();

    let url = authorize_url(&metadata, &round.provider, &started, REDIRECT);

    assert!(url.contains("/authorize?tenant=home&response_type=code&"));
}

#[test]
fn an_address_this_server_would_not_call_is_refused_before_any_request() {
    for issuer in [
        "ftp://id.test",
        "http://id.example.com",
        "https://user@id.example.com",
        "not a url",
        "",
    ] {
        assert_eq!(discover(issuer), Err(DiscoveryError::Address), "{issuer}");
    }
}

#[test]
fn a_typed_issuer_may_differ_from_the_published_one_by_a_trailing_slash_only() {
    let idp = FakeProvider::start();

    let with_slash = discover(&format!("{}/", idp.issuer));
    let other_path = discover(&format!("{}/realms/home", idp.issuer));

    assert_eq!(with_slash.map(|m| m.issuer), Ok(idp.issuer.clone()));
    assert_eq!(other_path, Err(DiscoveryError::NoDocument(404)));
}

#[test]
fn nothing_listening_reads_as_unreachable() {
    let gone = {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        format!("http://{}", listener.local_addr().unwrap())
    };

    assert!(matches!(
        discover(&gone),
        Err(DiscoveryError::Unreachable(_))
    ));
}

#[test]
fn every_failure_has_a_code_and_the_providers_word_is_stripped_to_plain_text() {
    let refused = |said: &str| {
        IdentifyError::Exchange(ExchangeError::Refused(400, Some(said.to_string()))).code()
    };

    assert_eq!(refused("invalid_client"), "exchange.invalid_client");
    assert_eq!(refused("<script>alert(1)</script>"), "exchange.scriptalert1script");
    assert_eq!(
        IdentifyError::Exchange(ExchangeError::Refused(500, None)).code(),
        "exchange.refused"
    );
    assert_eq!(
        IdentifyError::Exchange(ExchangeError::NoIdToken).code(),
        "exchange.noIdToken"
    );
    assert_eq!(
        IdentifyError::Exchange(ExchangeError::Unreachable("x".into())).code(),
        "exchange.unreachable"
    );
    assert_eq!(
        IdentifyError::Token(TokenError::Audience).code(),
        "token.audience"
    );
    assert_eq!(
        IdentifyError::Discovery(DiscoveryError::IssuerMismatch("x".into())).code(),
        "discovery.issuerMismatch"
    );
    assert_eq!(provider_said("access_denied"), "provider.access_denied");
    assert_eq!(provider_said("a b\"c"), "provider.abc");
}
