use serde::Serialize;

use super::AuthResult;
use crate::model::{LibraryScope, Permission};
use crate::services::settings::NewPeople;

/// The ways into this server, as the sign-in screen needs them.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInMethods {
    pub password: bool,
    pub passkeys: bool,
    pub providers: Vec<SignInButton>,
}

/// One "Continue with …" button.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInButton {
    pub id: String,
    pub label: String,
    pub icon: String,
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
    pub label: String,
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
    pub enabled: bool,
    pub tested: bool,
    pub live: bool,
    pub from_env: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInAdmin {
    pub password: bool,
    pub passkeys: bool,
    pub providers: Vec<ProviderView>,
    /// What to register at a provider as this server's redirect URI.
    pub redirect_uris: Vec<String>,
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
