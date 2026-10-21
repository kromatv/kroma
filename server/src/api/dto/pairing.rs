use serde::Serialize;

use crate::model::User;
use crate::services::pairing::PollState;

/// `POST /api/auth/quickconnect/initiate` a device-pairing request.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickConnectInit {
    pub code: String,
    pub secret: String,
    pub expires_in_sec: i64,
    pub authorize_url: Option<String>,
}

/// The status-tagged union both pairing polls answer with
/// (`/auth/quickconnect/poll`, `/handoff/poll`). `Expired` covers an unknown
/// secret too: a device that cannot tell them apart simply starts over.
#[derive(Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum PairingPoll {
    Pending,
    Expired,
    #[serde(rename_all = "camelCase")]
    Authorized {
        token: String,
        access_token: String,
        media_ticket: String,
        user: Box<User>,
    },
}

impl PairingPoll {
    /// The answer a waiting device gets, carrying a media ticket for the device
    /// this grant belongs to once there is a grant to collect.
    pub fn of(poll: PollState, signing_key: &str) -> Self {
        match poll {
            PollState::Authorized {
                token,
                access_token,
                user,
            } => Self::Authorized {
                media_ticket: crate::services::media_ticket::for_access_token(
                    signing_key,
                    &access_token,
                ),
                token,
                access_token,
                user,
            },
            PollState::Pending => Self::Pending,
            PollState::Unknown => Self::Expired,
        }
    }
}
