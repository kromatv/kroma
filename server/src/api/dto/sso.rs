use serde::Serialize;

use super::AuthResult;
use crate::model::{LibraryScope, Permission};
use crate::services::settings::NewPeople;

/// The ways into this server, in the order the sign-in screen offers them.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInMethods {
    pub methods: Vec<GateMethod>,
}

/// How a provider's button is painted on one screen: its fill, its edge when
/// the provider draws one, the ink of its label, and where the mark that sits
/// on the fill is fetched.
#[derive(Serialize)]
pub struct LookView {
    pub fill: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke: Option<String>,
    pub ink: String,
    pub logo: String,
}

/// A provider's button as its owner asks for it, on a dark screen and on a
/// light one.
#[derive(Serialize)]
pub struct BrandView {
    pub dark: LookView,
    pub light: LookView,
}

/// A provider the server knows by name, as the admin page offers it: what
/// its form starts with, where its owner has an application made (`console`)
/// and explains how (`docs`), where its mark is fetched, and its button's
/// look when its owner asks for one.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetView {
    pub id: String,
    pub name: String,
    pub label: String,
    pub icon: String,
    pub issuer: String,
    pub scopes: Vec<String>,
    pub group_claim: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub console: Option<String>,
    pub docs: String,
    pub logo: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand: Option<BrandView>,
}

/// One way in, as the sign-in screen draws it. `kind` says which control it
/// is: the password form, the passkey button, or a provider's button, which
/// alone carries a label, an icon, and maybe a mark and a look of its own.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GateMethod {
    pub id: String,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand: Option<BrandView>,
}

/// What a start hands the client: the two things it keeps, and where to send
/// the person.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowStarted {
    pub flow_id: String,
    pub secret: String,
    pub authorize_url: String,
    pub expires_in_sec: i64,
}

/// How a sign-in through a provider ended, for the client that began it.
#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum FlowResult {
    Pending,
    SignedIn(AuthResult),
    Requested,
    EmailTaken,
    InvitationOnly,
    Refused { reason: &'static str },
    Failed { reason: String },
    Linked,
    Tested { report: TestReportView },
}

/// What a test sign-in showed the admin about themselves.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestReportView {
    pub subject: String,
    pub username: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub groups: Vec<String>,
    pub admitted: bool,
}

/// One provider identity on `GET /auth/me/identities`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityView {
    pub id: String,
    pub provider: String,
    pub provider_id: Option<String>,
    pub name: String,
    pub created_at: String,
    pub last_used: Option<String>,
}

/// A provider as the admin page edits it. The secret and the test it passed
/// stay on the server: `has_secret` and `live` say what they amount to.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderView {
    pub id: String,
    pub enabled: bool,
    pub label: String,
    pub preset: String,
    pub icon: String,
    pub issuer: String,
    pub client_id: String,
    pub has_secret: bool,
    pub scopes: Vec<String>,
    pub group_claim: String,
    pub required_groups: Vec<String>,
    pub new_people: NewPeople,
    pub permissions: Vec<Permission>,
    pub libraries: LibraryScope,
    pub tested: bool,
    pub live: bool,
    pub from_env: bool,
}

/// One sign-in method as the admin page lists it.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum MethodView {
    Password { id: &'static str, enabled: bool },
    Passkey { id: &'static str, enabled: bool },
    Oidc(Box<ProviderView>),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInAdmin {
    pub methods: Vec<MethodView>,
    /// What to register at a provider as this server's redirect URI.
    pub redirect_uris: Vec<String>,
    /// Every provider the server knows by name, by name.
    pub presets: Vec<PresetView>,
}

/// What reading a provider's address found.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Discovered {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub issuer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scopes: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinRequestView {
    pub id: String,
    pub username: String,
    pub email: String,
    pub name: Option<String>,
    pub provider: String,
    pub created_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinRequests {
    pub waiting: Vec<JoinRequestView>,
    pub declined: Vec<JoinRequestView>,
}
