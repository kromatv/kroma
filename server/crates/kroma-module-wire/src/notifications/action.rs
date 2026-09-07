//! A notification's action buttons, in both their unrendered and rendered form.

use serde::{Deserialize, Serialize};

/// What an action button does when tapped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionKind {
    Link,
    Api,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionStyle {
    #[default]
    Default,
    Primary,
    Danger,
}

/// One button on a notification. `label` is rendered from an i18n key before it
/// goes out (see [`NotificationSpec`], which carries `label_key` instead).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAction {
    pub id: String,
    pub label: String,
    pub kind: ActionKind,
    // Client route for `ActionKind::Link`, API path for `ActionKind::Api`.
    pub href: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(default)]
    pub style: ActionStyle,
}

/// The unrendered half of an action, as producers declare it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSpec {
    pub id: String,
    pub label_key: String,
    pub kind: ActionKind,
    pub href: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(default)]
    pub style: ActionStyle,
}
