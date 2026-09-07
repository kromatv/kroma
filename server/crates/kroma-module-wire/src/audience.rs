//! Who a notification is for, and the button set a push carries.

use serde::{Deserialize, Serialize};

/// A set of action buttons the MOBILE app registers at launch.
///
/// Unlike Web Push (which takes arbitrary buttons per message), APNs can only
/// show actions belonging to a `UNNotificationCategory` the app registered up
/// front so the push payload names one of these instead of carrying buttons.
/// Adding a variant here means adding the matching category in the client.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PushCategory {
    RequestReview,
    MediaAvailable,
}

impl PushCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            PushCategory::RequestReview => "request_review",
            PushCategory::MediaAvailable => "media_available",
        }
    }

    pub fn parse(s: &str) -> Option<PushCategory> {
        match s {
            "request_review" => Some(PushCategory::RequestReview),
            "media_available" => Some(PushCategory::MediaAvailable),
            _ => None,
        }
    }
}

/// Who should be told about something.
///
/// Serializable because it crosses the module boundary: an out-of-process
/// `.kmod` names an audience and the core resolves it (a module has no business
/// enumerating accounts itself).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Audience {
    // One account, by id (the requester whose film arrived).
    User {
        id: String,
    },
    // Everyone holding a capability (the moderators who must review a request).
    Permission {
        permission: crate::Permission,
    },
    // Everyone with an account (a new film in the library).
    Everyone,
    // Everyone who follows a show — it is in their list, they marked it
    // watched, or they have progress on an episode (a new episode aired).
    Followers {
        show_id: String,
    },
}

impl Audience {
    /// `Audience::User` from anything string-ish, so call sites read as prose.
    pub fn user(id: impl Into<String>) -> Self {
        Audience::User { id: id.into() }
    }

    pub fn permission(permission: crate::Permission) -> Self {
        Audience::Permission { permission }
    }

    pub fn followers(show_id: impl Into<String>) -> Self {
        Audience::Followers {
            show_id: show_id.into(),
        }
    }
}
