//! An OpenID Connect provider that runs in-process: discovery, keys, the token
//! endpoint with PKCE and single-use codes, and user info. It can be told to
//! sign the next token wrongly, which is what the hostile tests are for.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::routing::{get, post};
use axum::Router;
use serde_json::{Map, Value};

use super::endpoints::{discovery, keys, token, user_info};
use super::signing::KEY_ID;
use crate::services::auth::random_token;
use crate::services::settings::Provider;

pub const CLIENT_ID: &str = "kroma";
pub const CLIENT_SECRET: &str = "s3cret & more";

/// How the next ID token is wrong.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Forgery {
    #[default]
    None,
    Unsigned,
    HmacWithThePublicKey,
    StrangerKey,
    WrongAudience,
    WrongIssuer,
    WrongNonce,
    Expired,
    /// Signed with a key id the provider only publishes afterwards.
    RotatedKey,
}

pub(super) struct Grant {
    pub(super) claims: Map<String, Value>,
    pub(super) nonce: String,
    pub(super) challenge: String,
    pub(super) redirect_uri: String,
}

#[derive(Default)]
pub(super) struct Book {
    pub(super) grants: HashMap<String, Grant>,
    pub(super) user_info: HashMap<String, Map<String, Value>>,
    pub(super) forgery: Forgery,
    pub(super) key_id: String,
    pub(super) claims_in_user_info_only: bool,
    pub(super) posts_its_secret: bool,
    pub(super) scopes: Vec<String>,
    pub(super) calls: Vec<String>,
}

pub(super) struct Shared {
    pub(super) issuer: String,
    pub(super) book: Mutex<Book>,
}

impl Shared {
    /// Mints the code for one consent and says where the browser goes next.
    pub(super) fn grant(&self, asked: &HashMap<String, String>, claims: Value) -> String {
        let field = |name: &str| asked.get(name).cloned().unwrap_or_default();
        let code = random_token();
        self.book.lock().expect("the provider's book").grants.insert(
            code.clone(),
            Grant {
                claims: claims.as_object().cloned().expect("claims are an object"),
                nonce: field("nonce"),
                challenge: field("code_challenge"),
                redirect_uri: field("redirect_uri"),
            },
        );
        format!("{}?code={code}&state={}", field("redirect_uri"), field("state"))
    }
}

pub struct FakeProvider {
    pub issuer: String,
    shared: Arc<Shared>,
}

pub(super) fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn query_of(url: &str) -> HashMap<String, String> {
    let query = url.split_once('?').map_or("", |(_, query)| query);
    form_urlencoded::parse(query.as_bytes())
        .into_owned()
        .collect()
}

fn serve(listener: std::net::TcpListener, shared: Arc<Shared>) {
    let app = Router::new()
        .route("/.well-known/openid-configuration", get(discovery))
        .route("/jwks", get(keys))
        .route("/token", post(token))
        .route("/userinfo", get(user_info))
        .route("/authorize", get(super::page::authorize))
        .with_state(shared);
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("a runtime for the provider")
        .block_on(async move {
            let listener =
                tokio::net::TcpListener::from_std(listener).expect("adopt the listener");
            let _ = axum::serve(listener, app).await;
        });
}

impl FakeProvider {
    /// Serves on a free local port, on a thread of its own, so a test that
    /// blocks on curl is still answered.
    pub fn start() -> FakeProvider {
        let (provider, listener) = FakeProvider::bound(0);
        let shared = provider.shared.clone();
        std::thread::spawn(move || serve(listener, shared));
        provider
    }

    /// Serves on `port` until the process ends, for a developer's browser.
    pub fn run(port: u16) {
        let (provider, listener) = FakeProvider::bound(port);
        provider.offer_scope("groups");
        println!("sign-in provider at {}", provider.issuer);
        println!("  client id      {CLIENT_ID}");
        println!("  client secret  {CLIENT_SECRET}");
        serve(listener, provider.shared);
    }

    fn bound(port: u16) -> (FakeProvider, std::net::TcpListener) {
        let listener =
            std::net::TcpListener::bind(("127.0.0.1", port)).expect("bind the provider");
        listener.set_nonblocking(true).expect("a non-blocking listener");
        let issuer = format!("http://{}", listener.local_addr().expect("its address"));
        let shared = Arc::new(Shared {
            issuer: issuer.clone(),
            book: Mutex::new(Book {
                key_id: KEY_ID.to_string(),
                scopes: vec!["openid".into(), "profile".into(), "email".into()],
                ..Book::default()
            }),
        });
        (FakeProvider { issuer, shared }, listener)
    }

    fn book(&self) -> std::sync::MutexGuard<'_, Book> {
        self.shared.book.lock().expect("the provider's book")
    }

    /// The settings entry of a provider an operator pointed at this one.
    pub fn settings(&self, id: &str) -> Provider {
        Provider {
            id: id.to_string(),
            label: "Home".to_string(),
            issuer: self.issuer.clone(),
            client_id: CLIENT_ID.to_string(),
            client_secret: CLIENT_SECRET.to_string(),
            ..Provider::default()
        }
    }

    /// The person signs in and consents: the address the provider sends their
    /// browser back to. `claims` is what the provider knows about them.
    pub fn approve(&self, authorize_url: &str, claims: Value) -> String {
        let asked = query_of(authorize_url);
        assert_eq!(asked["response_type"], "code");
        assert_eq!(asked["client_id"], CLIENT_ID);
        assert_eq!(asked["code_challenge_method"], "S256");
        assert!(asked["scope"].split(' ').any(|scope| scope == "openid"));
        self.shared.grant(&asked, claims)
    }

    /// The person says no at the provider.
    pub fn deny(&self, authorize_url: &str) -> String {
        let asked = query_of(authorize_url);
        format!(
            "{}?error=access_denied&state={}",
            asked["redirect_uri"], asked["state"]
        )
    }

    pub fn scope_asked(&self, authorize_url: &str) -> String {
        query_of(authorize_url)["scope"].clone()
    }

    pub fn forge(&self, forgery: Forgery) {
        self.book().forgery = forgery;
    }

    /// Leaves the ID token with nothing but who and for whom, the way a
    /// provider does when its claims live at the user info endpoint.
    pub fn keep_claims_for_user_info(&self) {
        self.book().claims_in_user_info_only = true;
    }

    pub fn accept_the_secret_in_the_body_only(&self) {
        self.book().posts_its_secret = true;
    }

    pub fn offer_scope(&self, scope: &str) {
        self.book().scopes.push(scope.to_string());
    }

    pub fn calls(&self) -> Vec<String> {
        self.book().calls.clone()
    }
}
