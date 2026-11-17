use serde::{Deserialize, Serialize};

/// Where a sign-in to another server stands. `Ready` names the sign-in the
/// importer now keeps and the servers it reaches. `Pending` gives the page the
/// owner opens and the id to ask again with. `Refused` says why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Connected {
    #[serde(rename_all = "camelCase")]
    Ready {
        sign_in: String,
        #[serde(default)]
        servers: Vec<Server>,
    },
    #[serde(rename_all = "camelCase")]
    Pending {
        pending: String,
        url: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        expires_at: Option<i64>,
    },
    Refused {
        #[serde(default)]
        reason: RefusalReason,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
}

/// Why a sign-in was turned down. A reason this build does not know reads as
/// `Other`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RefusalReason {
    Credentials,
    Unreachable,
    NotAdministrator,
    Expired,
    Unsupported,
    #[default]
    #[serde(other)]
    Other,
}

/// One server a sign-in reaches.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
}
