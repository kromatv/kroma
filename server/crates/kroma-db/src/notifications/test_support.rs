use std::collections::BTreeMap;

use super::{insert_notification, StoredNotification};
use crate::testing::TempPool;
use crate::Pool;

use kroma_domain::{
    ActionKind, ActionSpec, ActionStyle, NotificationEvent, ParamValue, PushCategory,
};

// Real accounts: notifications.user_id FKs users (and cascades).
pub(super) fn pool() -> (TempPool, String, String) {
    let p = crate::testing::temp_pool("notif");
    let u1 = crate::create_user(&p, "ana@test.dev", "Ana", "h", &[])
        .unwrap()
        .id;
    let u2 = crate::create_user(&p, "bo@test.dev", "Bo", "h", &[])
        .unwrap()
        .id;
    (p, u1, u2)
}

pub(super) fn new(id: &str, created_at: i64) -> StoredNotification {
    StoredNotification {
        id: id.into(),
        category: NotificationEvent::RequestApproved.category(),
        event: NotificationEvent::RequestApproved,
        title_key: "notifications.request.approved.title".into(),
        body_key: "notifications.request.approved.body".into(),
        params: BTreeMap::from([("title".to_string(), ParamValue::Text("Dune".into()))]),
        link: Some("/movie/ab12".into()),
        image_url: Some("https://img/p.jpg".into()),
        actions: vec![ActionSpec {
            id: "view".into(),
            label_key: "notifications.action.view".into(),
            kind: ActionKind::Link,
            href: "/movie/ab12".into(),
            method: None,
            style: ActionStyle::Primary,
        }],
        push_category: Some(PushCategory::MediaAvailable),
        read: false,
        created_at,
    }
}

pub(super) fn insert(p: &Pool, id: &str, user: &str, at: i64) -> u32 {
    let conn = p.get().unwrap();
    insert_notification(&conn, user, &new(id, at)).unwrap()
}
