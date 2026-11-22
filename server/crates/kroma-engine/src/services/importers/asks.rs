use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// What the core sends `connect`: the form the owner filled, by field key, or
/// the id a `pending` answer gave. It carries the owner's secrets, so it has no
/// `Debug`.
#[derive(Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ConnectAsk {
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub fields: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurveyAsk {
    pub sign_in: String,
    pub server: String,
}

/// One page of a library's titles. No `cursor` asks for the first page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TitlesAsk {
    pub sign_in: String,
    pub server: String,
    pub library: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

/// One page of one user's watch state in one library. `changed_since` is unix
/// seconds, and asks only for what changed at or after it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatesAsk {
    pub sign_in: String,
    pub server: String,
    pub user: String,
    pub library: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changed_since: Option<i64>,
}

/// One page of a server's plays. `changed_since` is unix seconds, and asks only
/// for the plays recorded at or after it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaysAsk {
    pub sign_in: String,
    pub server: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changed_since: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgetAsk {
    pub sign_in: String,
}

/// What the core sends `unlock`: the user of one server whose watch state is
/// locked, and the PIN the owner typed for them. It carries that PIN, so it
/// has no `Debug`.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockAsk {
    pub sign_in: String,
    pub server: String,
    pub user: String,
    pub pin: String,
}
