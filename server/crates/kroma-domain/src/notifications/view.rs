//! One notification as a client sees it, plus the per-category delivery matrix.

use serde::{Deserialize, Serialize};

use crate::push::PushCategory;

use super::action::NotificationAction;
use super::event::{NotificationCategory, NotificationEvent};

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
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    pub actions: Vec<NotificationAction>,
    // APNs and Android can only show buttons from a set the app registered at
    // launch, so this names one. Ignored by the web client, which uses `actions`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub push_category: Option<PushCategory>,
    pub read: bool,
    pub created_at: i64,
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

/// `GET`/`PUT /api/notifications/prefs`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPrefs {
    pub categories: Vec<CategoryPref>,
}
