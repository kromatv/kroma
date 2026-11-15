//! A household whose server signs people in through a provider, and the steps
//! of one sign-in driven the way a browser would.

use axum::http::StatusCode;
use serde_json::{json, Value};

use super::{raw, test_app, TestApp};
use crate::services::settings::{self, Method, Provider, SignIn};
use crate::services::sso::testing::FakeProvider;

/// The origin the browser in these tests is on.
pub const ORIGIN: &str = "http://kroma.test";

pub struct ProviderRound {
    pub t: TestApp,
    pub idp: FakeProvider,
}

/// What a flow's start returned, and the code its redirect carried.
pub struct Returned {
    pub flow_id: String,
    pub secret: String,
    pub code: String,
}

impl Returned {
    pub fn keys(&self) -> Value {
        json!({ "flowId": self.flow_id, "secret": self.secret, "code": self.code })
    }
}

/// A server with one live provider, `p0`, shaped by `configure`.
pub fn at_provider(configure: impl FnOnce(&mut Provider)) -> ProviderRound {
    let t = test_app();
    let idp = FakeProvider::start();
    let mut provider = idp.settings("p0");
    configure(&mut provider);
    let fingerprint = provider.fingerprint();
    let mut config = SignIn::default();
    config.methods.push(Method::Oidc(Box::new(provider)));
    settings::set_sign_in(&t.state.settings, &t.state.db, None, config)
        .expect("store the provider");
    settings::mark_provider_tested(&t.state.settings, &t.state.db, "p0", &fingerprint);
    ProviderRound { t, idp }
}

fn query_value(url: &str, key: &str) -> String {
    url.split_once('?')
        .map_or("", |(_, query)| query)
        .split('&')
        .find_map(|pair| pair.strip_prefix(&format!("{key}=")))
        .unwrap_or_default()
        .to_string()
}

impl ProviderRound {
    /// Posts a flow-starting request from the browser's origin.
    pub async fn begin(&self, uri: &str, token: Option<&str>, body: Value) -> (StatusCode, Value) {
        let (status, _, started) = raw(
            &self.t.app,
            "POST",
            uri,
            token,
            Some(body),
            &[("origin", ORIGIN)],
        )
        .await;
        (status, started)
    }

    /// Follows a provider's redirect into the callback: the status, and where
    /// the browser is sent next.
    pub async fn follow(&self, redirect: &str) -> (StatusCode, String) {
        let path = redirect.strip_prefix(ORIGIN).expect("a redirect to this server");
        let (status, headers, _) = raw(&self.t.app, "GET", path, None, None, &[]).await;
        let location = headers
            .get("location")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string();
        (status, location)
    }

    /// A started flow taken through the provider as `claims` and back.
    pub async fn through(&self, started: &Value, claims: Value) -> Returned {
        let redirect = self
            .idp
            .approve(started["authorizeUrl"].as_str().expect("authorizeUrl"), claims);
        let (status, location) = self.follow(&redirect).await;
        assert_eq!(status, StatusCode::SEE_OTHER);
        assert!(location.starts_with(&format!("{ORIGIN}/sso?")), "{location}");
        Returned {
            flow_id: started["flowId"].as_str().expect("flowId").to_string(),
            secret: started["secret"].as_str().expect("secret").to_string(),
            code: query_value(&location, "code"),
        }
    }

    pub async fn finish(&self, returned: &Returned) -> (StatusCode, Value) {
        let (status, _, body) = raw(
            &self.t.app,
            "POST",
            "/api/auth/sso/finish",
            None,
            Some(returned.keys()),
            &[],
        )
        .await;
        (status, body)
    }

    /// One whole sign-in at `p0` as `claims`: what `finish` answered.
    pub async fn sign_in(&self, claims: Value) -> Value {
        self.sign_in_with(json!({ "provider": "p0" }), claims).await
    }

    pub async fn sign_in_with(&self, start: Value, claims: Value) -> Value {
        let (status, started) = self.begin("/api/auth/sso/start", None, start).await;
        assert_eq!(status, StatusCode::OK, "{started}");
        let returned = self.through(&started, claims).await;
        let (status, body) = self.finish(&returned).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        body
    }
}
