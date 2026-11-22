use serde::{Deserialize, Serialize};

/// Whether a user whose watch state was locked can be read now. `Refused`
/// says why not, and a PIN the other server did not take is one such answer,
/// not a failure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Unlock {
    Unlocked,
    Refused {
        #[serde(default)]
        reason: UnlockRefusal,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
}

/// Why a user stayed locked. A reason this build does not know reads as
/// `Other`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UnlockRefusal {
    Pin,
    NotLocked,
    Credentials,
    Unreachable,
    #[default]
    #[serde(other)]
    Other,
}
