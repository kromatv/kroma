//! One notification row as it sits in the table, and the mapping each way.

use std::collections::BTreeMap;

use kroma_domain::{
    ActionSpec, NotificationCategory, NotificationEvent, NotificationSpec, NotificationSubject,
    ParamValue, PushCategory,
};

use crate::Row;

// Column order must match `row_to_notification`.
pub(super) const NOTIFICATION_COLS: &str = "id, category, event, title_key, body_key, params, \
    link, image_url, actions, push_category, read_at, created_at, subject_kind, subject_id, \
    actor_id, data, dedupe_key, group_key, count, COALESCE(updated_at, created_at), \
    resolved_at, resolved_by";

/// The ceiling on an event's `data`, enforced where the row is written so a
/// module's object is bounded like any other cross-process body.
pub const MAX_DATA_BYTES: usize = 4 * 1024;

/// One notification as stored: keys + params, not yet rendered.
#[derive(Debug, Clone)]
pub struct StoredNotification {
    pub id: String,
    pub category: NotificationCategory,
    pub event: NotificationEvent,
    pub title_key: String,
    pub body_key: String,
    pub params: BTreeMap<String, ParamValue>,
    pub subject: Option<NotificationSubject>,
    pub actor_id: Option<String>,
    pub data: Option<serde_json::Value>,
    pub dedupe_key: Option<String>,
    pub group_key: Option<String>,
    pub count: u32,
    pub updated_at: i64,
    pub resolved_at: Option<i64>,
    pub resolved_by: Option<String>,
    pub link: Option<String>,
    pub image_url: Option<String>,
    pub actions: Vec<ActionSpec>,
    pub push_category: Option<PushCategory>,
    pub read: bool,
    pub created_at: i64,
}

impl StoredNotification {
    /// The row a producer's spec becomes, once it has an id and a timestamp.
    /// The category is the spec's rather than the event's default, so a module
    /// keeps the preference bucket it named.
    pub fn from_spec(id: impl Into<String>, spec: &NotificationSpec, created_at: i64) -> Self {
        Self {
            id: id.into(),
            category: spec.category(),
            event: spec.event,
            title_key: spec.title_key.clone(),
            body_key: spec.body_key.clone(),
            params: spec.params.clone(),
            subject: spec.subject.clone(),
            actor_id: spec.actor_id.clone(),
            data: spec.data.clone(),
            dedupe_key: spec.dedupe_key.clone(),
            group_key: spec.group(),
            count: 1,
            updated_at: created_at,
            resolved_at: None,
            resolved_by: None,
            link: spec.link.clone(),
            image_url: spec.image_url.clone(),
            actions: spec.actions.clone(),
            push_category: spec.push_category,
            read: false,
            created_at,
        }
    }
}

pub(super) fn row_to_notification(r: &Row) -> rusqlite::Result<StoredNotification> {
    let category: String = r.get(1)?;
    let event: String = r.get(2)?;
    let params: String = r.get(5)?;
    let actions: String = r.get(8)?;
    let push_category: Option<String> = r.get(9)?;
    let read_at: Option<i64> = r.get(10)?;
    let subject_kind: Option<String> = r.get(12)?;
    let subject_id: Option<String> = r.get(13)?;
    let data: Option<String> = r.get(15)?;
    Ok(StoredNotification {
        id: r.get(0)?,
        // Unknown category (written by a newer build): fall back rather than drop the row.
        category: NotificationCategory::parse(&category).unwrap_or(NotificationCategory::System),
        // An unknown event is exactly what `Custom` means.
        event: NotificationEvent::parse(&event).unwrap_or(NotificationEvent::Custom),
        title_key: r.get(3)?,
        body_key: r.get(4)?,
        params: serde_json::from_str(&params).unwrap_or_default(),
        subject: subject_kind
            .zip(subject_id)
            .map(|(kind, id)| NotificationSubject { kind, id }),
        actor_id: r.get(14)?,
        data: data.as_deref().and_then(|raw| serde_json::from_str(raw).ok()),
        dedupe_key: r.get(16)?,
        group_key: r.get(17)?,
        count: r.get(18)?,
        updated_at: r.get(19)?,
        resolved_at: r.get(20)?,
        resolved_by: r.get(21)?,
        link: r.get(6)?,
        image_url: r.get(7)?,
        actions: serde_json::from_str(&actions).unwrap_or_default(),
        push_category: push_category.as_deref().and_then(PushCategory::parse),
        read: read_at.is_some(),
        created_at: r.get(11)?,
    })
}

pub(super) fn data_column(n: &StoredNotification) -> Option<String> {
    n.data
        .as_ref()
        .and_then(|value| serde_json::to_string(value).ok())
        .filter(|json| json.len() <= MAX_DATA_BYTES)
}
