use serde_json::json;

use kroma_module_host::{Event, HostStorage};

use crate::db;
use crate::model::{
    ActionKind, ActionSpec, ActionStyle, Audience, MediaRequest, NotificationEvent,
    NotificationSpec, Permission, PushCategory, RequestKind, RequestStatus, User,
};

#[cfg(test)]
mod tests;

pub(super) fn publish<S: HostStorage>(state: &S, req_id: &str, status: RequestStatus) {
    // Clients depend on the wire shape `{ "type": "request.updated", id, status }`;
    // HostCtx::publish merges the topic under the `type` key.
    state.publish(Event::new(
        "request.updated",
        json!({ "id": req_id, "status": status.as_str() }),
    ));
}

// Only call on a real state change: [`publish`] fires on every touch, but a
// notification must mark a transition.
pub(super) fn notify_requester<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    status: RequestStatus,
    link: &str,
) {
    let Some(user_id) = req.requested_by.as_deref() else {
        return;
    };
    let (event, key) = match status {
        RequestStatus::Approved => (NotificationEvent::RequestApproved, "approved"),
        RequestStatus::Denied => (NotificationEvent::RequestDenied, "denied"),
        RequestStatus::Available | RequestStatus::PartiallyAvailable => {
            (NotificationEvent::RequestAvailable, "available")
        }
        RequestStatus::Pending
        | RequestStatus::Searching
        | RequestStatus::Downloading
        | RequestStatus::Importing
        | RequestStatus::Failed => return,
    };
    let available = matches!(
        status,
        RequestStatus::Available | RequestStatus::PartiallyAvailable
    );
    let mut spec = NotificationSpec::new(
        event,
        &format!("notifications.request.{key}.title"),
        &format!("notifications.request.{key}.body"),
    )
    .param("title", req.title.clone())
    .image(req.poster_url.clone())
    .link(link);
    if let Some(note) = req
        .note
        .as_deref()
        .filter(|_| status == RequestStatus::Denied)
    {
        spec = spec.param("note", note);
    }
    if available {
        spec = spec
            .push_category(PushCategory::MediaAvailable)
            .action(ActionSpec {
                id: "watch".into(),
                label_key: "notifications.action.watch".into(),
                kind: ActionKind::Link,
                href: link.to_string(),
                method: None,
                style: ActionStyle::Primary,
            });
    }
    state.notify(&Audience::user(user_id), &spec);
}

pub(super) fn notify_moderators<S: HostStorage>(state: &S, req: &MediaRequest, requester: &User) {
    let spec = NotificationSpec::new(
        NotificationEvent::RequestSubmitted,
        "notifications.request.submitted.title",
        "notifications.request.submitted.body",
    )
    .param("title", req.title.clone())
    .param("user", requester.username.clone())
    .image(req.poster_url.clone())
    .link("/admin/requests")
    .push_category(PushCategory::RequestReview)
    .action(ActionSpec {
        id: "approve".into(),
        label_key: "notifications.action.approve".into(),
        kind: ActionKind::Api,
        href: format!("/api/requests/{}/approve", req.id),
        method: Some("POST".into()),
        style: ActionStyle::Primary,
    })
    .action(ActionSpec {
        id: "deny".into(),
        label_key: "notifications.action.deny".into(),
        kind: ActionKind::Api,
        href: format!("/api/requests/{}/deny", req.id),
        method: Some("POST".into()),
        style: ActionStyle::Danger,
    });
    state.notify(&Audience::permission(Permission::RequestsManage), &spec);
}

pub(super) fn request_link<S: HostStorage>(state: &S, req: &MediaRequest) -> String {
    let local = state.db().get().ok().and_then(|conn| match req.kind {
        RequestKind::Movie => db::movie_item_by_tmdb(&conn, req.tmdb_id)
            .ok()
            .flatten()
            .map(|id| format!("/movie/{id}")),
        RequestKind::Show => db::show_by_tmdb(&conn, req.tmdb_id)
            .ok()
            .flatten()
            .map(|id| format!("/show/{id}")),
    });
    local.unwrap_or_else(|| "/requests".to_string())
}

pub(super) fn notify_transition<S: HostStorage>(state: &S, id: &str, status: RequestStatus) {
    let Ok(conn) = state.db().get() else { return };
    let Ok(Some(req)) = db::get_request(&conn, id) else {
        return;
    };
    drop(conn);
    let link = request_link(state, &req);
    notify_requester(state, &req, status, &link);
}
