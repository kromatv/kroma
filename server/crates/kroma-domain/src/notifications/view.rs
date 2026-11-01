//! One notification as a client sees it, plus the delivery matrix.

use serde::{Deserialize, Serialize};

use crate::push::PushCategory;

use super::{
    NotificationAction, NotificationActor, NotificationCategory, NotificationEvent,
    NotificationSubject,
};

/// One notification as a client sees it: fully rendered in the reader's locale.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub category: NotificationCategory,
    pub event: NotificationEvent,
    pub title: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<NotificationSubject>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor: Option<NotificationActor>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    /// What a repeat of this row collapses onto, so a device replaces the
    /// earlier banner instead of stacking beside it. `None` for a row nothing
    /// may fold into.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    pub actions: Vec<NotificationAction>,
    // APNs and Android can only show buttons from a set the app registered at
    // launch, so this names one. Ignored by the web client, which uses `actions`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub push_category: Option<PushCategory>,
    pub read: bool,
    /// Set once the subject no longer needs anyone. A settled row keeps its
    /// place and its words, and carries no actions.
    pub resolved: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_by: Option<NotificationActor>,
    /// Emissions this row stands for. `1` for a row nothing folded into, which
    /// is how a client built before folding reads every row.
    pub count: u32,
    pub created_at: i64,
    /// The latest emission. The inbox sorts by this, and with `created_at` it
    /// gives the span a folded row reads as.
    pub updated_at: i64,
}

/// `GET /api/notifications`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationsView {
    pub notifications: Vec<Notification>,
    pub unread: u32,
}

/// One row of the per-category delivery matrix. A missing DB row means "on", so
/// a new category starts enabled without a migration touching every user.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryPref {
    pub category: NotificationCategory,
    pub in_app: bool,
    pub push: bool,
}

/// One notification type's row in the delivery matrix, labelled in its
/// reader's language and carrying the switches it ends up with: its own where
/// the reader chose, its category's elsewhere.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypePref {
    #[serde(rename = "type")]
    pub name: String,
    pub category: NotificationCategory,
    pub label: String,
    pub in_app: bool,
    pub push: bool,
}

/// `GET /api/notifications/prefs`, and what a `PUT` answers.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPrefs {
    pub categories: Vec<CategoryPref>,
    pub types: Vec<TypePref>,
}

/// The switches a reader set on one notification type.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeSwitches {
    #[serde(rename = "type")]
    pub name: String,
    pub in_app: bool,
    pub push: bool,
}

/// `PUT /api/notifications/prefs`. Each list may be left out, which is what a
/// client built before per-type choice does with `types`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefsUpdate {
    #[serde(default)]
    pub categories: Vec<CategoryPref>,
    #[serde(default)]
    pub types: Vec<TypeSwitches>,
}
