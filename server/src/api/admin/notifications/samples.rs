//! The sample of each event the core can send: what the composer previews and
//! what a named send is rendered from.

use crate::model::{
    ActionKind, ActionSpec, ActionStyle, NotificationCategory, NotificationEvent, NotificationSpec,
    PushCategory,
};

// Uses the same message keys a real producer would, so what lands in the bell
// matches the real thing. Buttons are always LINKS here, even where the real
// notification carries an API action, so a preview never POSTs to a request
// that doesn't exist.
pub(super) fn sample(event: NotificationEvent, admin: &str) -> NotificationSpec {
    let film = "Sample Film";
    match event {
        NotificationEvent::RequestSubmitted => NotificationSpec::new(
            event,
            "notifications.request.submitted.title",
            "notifications.request.submitted.body",
        )
        .param("title", film)
        .param("user", admin)
        .link("/admin/requests")
        .push_category(PushCategory::RequestReview)
        .action(link_action(
            "review",
            "notifications.action.review",
            "/admin/requests",
        )),
        NotificationEvent::RequestApproved => NotificationSpec::new(
            event,
            "notifications.request.approved.title",
            "notifications.request.approved.body",
        )
        .param("title", film)
        .link("/requests"),
        NotificationEvent::RequestDenied => NotificationSpec::new(
            event,
            "notifications.request.denied.title",
            "notifications.request.denied.body",
        )
        .param("title", film)
        .param("note", "Sample reason")
        .link("/requests"),
        NotificationEvent::RequestAvailable => NotificationSpec::new(
            event,
            "notifications.request.available.title",
            "notifications.request.available.body",
        )
        .param("title", film)
        .link("/")
        .push_category(PushCategory::MediaAvailable)
        .action(link_action("watch", "notifications.action.watch", "/")),
        NotificationEvent::MediaAdded => NotificationSpec::new(
            event,
            "notifications.media.added.title",
            "notifications.media.added.body",
        )
        .param("count", "3")
        .link("/"),
        NotificationEvent::MediaEpisode => NotificationSpec::new(
            event,
            "notifications.media.episode.title",
            "notifications.media.episode.body",
        )
        .param("title", "Sample Show")
        .param("episode", "S01E01")
        .link("/"),
        NotificationEvent::ReportSubmitted => NotificationSpec::new(
            event,
            "notifications.report.submitted.title",
            "notifications.report.submitted.body",
        )
        .param("title", film)
        .param("user", admin)
        .link("/admin/reports")
        .action(link_action(
            "review",
            "notifications.action.review",
            "/admin/reports",
        )),
        NotificationEvent::ReportResolved => NotificationSpec::new(
            event,
            "notifications.report.resolved.title",
            "notifications.report.resolved.body",
        )
        .param("title", film),
        NotificationEvent::ReportDismissed => NotificationSpec::new(
            event,
            "notifications.report.dismissed.title",
            "notifications.report.dismissed.body",
        )
        .param("title", film),
        NotificationEvent::DownloadImported => NotificationSpec::new(
            event,
            "notifications.download.imported.title",
            "notifications.download.imported.body",
        )
        .param("title", film)
        .link("/"),
        NotificationEvent::DownloadFailed => NotificationSpec::new(
            event,
            "notifications.download.failed.title",
            "notifications.download.failed.body",
        )
        .param("title", film)
        .link("/admin/jobs"),
        NotificationEvent::SystemJobFailed => NotificationSpec::new(
            event,
            "notifications.system.job.failed.title",
            "notifications.system.job.failed.body",
        )
        .param("job", "Library scan")
        .link("/admin/jobs"),
        NotificationEvent::SystemDiskLow => NotificationSpec::new(
            event,
            "notifications.system.disk.low.title",
            "notifications.system.disk.low.body",
        )
        .param("free", "4 GB")
        .param("path", "/media")
        .link("/admin/storage"),
        // The push self-check's own wording, so "does push work" can be asked
        // from here too and not only from a viewer's own settings.
        NotificationEvent::SystemTest => {
            NotificationSpec::new(event, "notifications.test.title", "notifications.test.body")
        }
        // Nothing canned to show: a custom notification is whatever the composer
        // typed, so the bench's preset for it is an empty one.
        NotificationEvent::Custom => NotificationSpec::custom(
            NotificationCategory::System,
            "Sample notification",
            "Whatever you type here is what people read.",
        ),
    }
}

// A button that only navigates. See `sample` for why nothing here POSTs.
fn link_action(id: &str, label_key: &str, href: &str) -> ActionSpec {
    ActionSpec {
        id: id.into(),
        label_key: label_key.into(),
        kind: ActionKind::Link,
        href: href.into(),
        method: None,
        style: ActionStyle::Primary,
    }
}
