use kroma_domain::{Notification, NotificationAction, NotificationCategory, NotificationEvent};

pub(super) fn notification(category: NotificationCategory) -> Notification {
    Notification {
        id: "n1".into(),
        category,
        event: NotificationEvent::RequestAvailable,
        title: "Ready to watch".into(),
        body: "Dune is now in your library.".into(),
        link: Some("/movie/ab12".into()),
        image_url: Some("https://img/p.jpg".into()),
        actions: vec![NotificationAction {
            id: "watch".into(),
            label: "Watch".into(),
            kind: kroma_domain::ActionKind::Link,
            href: "/movie/ab12".into(),
            method: None,
            style: kroma_domain::ActionStyle::Primary,
        }],
        push_category: None,
        read: false,
        created_at: 1_700_000_000_000,
    }
}
