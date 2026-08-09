//! Sending notifications from the console: a composer, its samples, and the
//! image an admin attaches to one. `GET .../samples` renders the catalogue of
//! the core's own events so an admin can preview one without triggering it for
//! real; the same send endpoint also accepts a written announcement (title,
//! body, optional link/image), riding in as [`NotificationEvent::Custom`].
//!
//! Every send goes through [`notify::emit`] exactly as a real producer's would,
//! so it exercises category preferences, per-recipient rendering, the stored
//! row, the live bus event and the push fan-out - nothing here is a mock.
//!
//! `settings.manage` only; audience is stated per call, and "everyone" writes a
//! row into every account on the server.

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Json;
use axum::Router;
use serde::Deserialize;
use serde_json::json;

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use kroma_db::notifications::StoredNotification;

use crate::model::{
    ActionKind, ActionSpec, ActionStyle, Audience, Notification, NotificationCategory,
    NotificationEvent, NotificationSpec, Permission, PushCategory,
};
use crate::state::SharedState;

// Matches the avatar upload's cap.
const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;

// The relay's own limits on a push (`packages/push-relay/worker/schemas.ts`),
// enforced here too: the relay rejects an over-long push with a 400 per
// recipient rather than dropping it, which can trip a device's unsubscribe
// threshold - and the admin endpoint would still report success (it counts
// in-app rows). Refusing at the console turns that into one 400 up front.
const MAX_TITLE: usize = 256;
const MAX_BODY: usize = 1024;
const MAX_LINK: usize = 1024;
const MAX_IMAGE_URL: usize = 2048;

// zod's `.max()` on the relay side counts UTF-16 code units, not `chars()`, so
// an emoji counts twice there; match that so "accepted here" implies "accepted
// there".
fn wire_len(s: &str) -> usize {
    s.encode_utf16().count()
}

fn within(value: &str, max: usize, too_long: &'static str) -> Result<(), &'static str> {
    if wire_len(value) > max {
        return Err(too_long);
    }
    Ok(())
}

// A notification's image is drawn at ~44px in a list row and at most a phone's
// width in a rich push; a master past this is bytes nobody ever sees.
const IMAGE_MAX_WIDTH: u32 = 1280;

// Uploads share the poster cache's directory; the prefix is what lets the
// listing tell an admin's uploads from thousands of cached posters.
const UPLOAD_PREFIX: &str = "notif-";

const MAX_LISTED_IMAGES: usize = 200;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/notifications", post(send))
        .route("/notifications/samples", get(catalogue))
        .route(
            "/notifications/image",
            post(upload_image).layer(DefaultBodyLimit::max(MAX_IMAGE_BYTES)),
        )
        .route("/notifications/images", get(list_images))
}

/// `GET /api/admin/notifications/samples` → every kind this server can send,
/// each already RENDERED in the admin's own language.
///
/// The page could not build these itself without copying the sample parameters
/// and the message keys into the client, where they would drift from what the
/// button actually sends. Rendering them here means the preview on screen is the
/// notification, not a drawing of one.
pub async fn catalogue(AuthUser(user): AuthUser) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let locale = super::user_locale(&user);
    let events: Vec<Notification> = NotificationEvent::ALL
        .iter()
        .map(|&event| preview(event, &user.username, locale))
        .collect();
    Ok(Json(json!({ "events": events })).into_response())
}

// The id is the event name: these rows are never stored, and the page keys its
// list by it.
fn preview(event: NotificationEvent, admin: &str, locale: &str) -> Notification {
    let spec = sample(event, admin);
    let stored = StoredNotification {
        id: event.as_str().to_string(),
        category: spec.category(),
        event: spec.event,
        title_key: spec.title_key.clone(),
        body_key: spec.body_key.clone(),
        params: spec.params.clone(),
        link: spec.link.clone(),
        image_url: spec.image_url.clone(),
        actions: spec.actions.clone(),
        push_category: spec.push_category,
        read: false,
        created_at: 0,
    };
    kroma_engine::services::notify::render::render(&stored, locale)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendBody {
    // Ignored when `title` is given: what the composer shows is what gets sent.
    #[serde(default)]
    pub event: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    // Defaults to `system` when omitted.
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub link: Option<String>,
    #[serde(default)]
    pub image_url: Option<String>,
    // Defaults to the caller alone, which is the safe answer.
    #[serde(default)]
    pub target: Target,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    #[default]
    Me,
    Admins,
    Everyone,
}

/// `POST /api/admin/notifications` → `{ delivered }`, the number of people it
/// actually reached (people who muted the category are not counted).
pub async fn send(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<SendBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let audience = match body.target {
        Target::Me => Audience::user(user.id.clone()),
        Target::Admins => Audience::permission(Permission::SettingsManage),
        Target::Everyone => Audience::Everyone,
    };
    let spec = match compose(&body, &user.username) {
        Ok(spec) => spec,
        Err(message) => return Err(json_error(StatusCode::BAD_REQUEST, message)),
    };
    let bg = state.clone();
    // `emit` resolves the audience and writes a row per recipient: blocking work.
    let delivered =
        blocking(move || Ok(kroma_engine::services::notify::emit(&bg, &audience, &spec))).await?;
    Ok(Json(json!({ "delivered": delivered })).into_response())
}

fn compose(body: &SendBody, admin: &str) -> Result<NotificationSpec, &'static str> {
    if let Some(title) = body.title.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
        let category = match body.category.as_deref() {
            None => NotificationCategory::System,
            Some(raw) => {
                NotificationCategory::parse(raw).ok_or("unknown notification category")?
            }
        };
        let text = body.body.clone().unwrap_or_default();
        within(title, MAX_TITLE, "title is too long")?;
        within(&text, MAX_BODY, "body is too long")?;

        let mut spec = NotificationSpec::custom(category, title, text);
        if let Some(link) = body.link.as_deref().map(str::trim).filter(|l| !l.is_empty()) {
            within(link, MAX_LINK, "link is too long")?;
            spec = spec.link(link);
        }
        let image = body.image_url.as_deref().map(str::trim).filter(|u| !u.is_empty());
        if let Some(image) = image {
            within(image, MAX_IMAGE_URL, "image URL is too long")?;
        }
        return Ok(spec.image(image.map(str::to_string)));
    }
    let event = body
        .event
        .as_deref()
        .and_then(NotificationEvent::parse)
        .ok_or("unknown notification event")?;
    Ok(sample(event, admin))
}

/// `POST /api/admin/notifications/image` (raw `image/*` body) → `{ imageUrl }`.
///
/// The same content-addressed WebP store the avatars use, so an attached poster
/// is served by the image route every client already resolves - no second
/// pipeline, and no absolute URL baked into a stored notification.
pub async fn upload_image(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    body: Bytes,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    if body.is_empty() {
        return Err(json_error(StatusCode::BAD_REQUEST, "empty body"));
    }
    let data_dir = state.config.data_dir.clone();
    let bytes = body.to_vec();
    let url = blocking(move || {
        Ok(kroma_engine::infra::image::store_upload(
            &data_dir,
            &bytes,
            Some(IMAGE_MAX_WIDTH),
            UPLOAD_PREFIX,
        ))
    })
    .await?;
    match url {
        Some(url) => Ok(Json(json!({ "imageUrl": url })).into_response()),
        None => Err(json_error(StatusCode::UNSUPPORTED_MEDIA_TYPE, "unreadable image")),
    }
}

/// `GET /api/admin/notifications/images` → the images previously uploaded for
/// notifications, newest first, capped at 200. Nothing else in the shared image
/// cache (posters, avatars, renditions) is listed.
pub async fn list_images(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let dir = crate::infra::image::images_dir(&state.config.data_dir);
    let images = blocking(move || Ok(uploaded_images(&dir))).await?;
    Ok(Json(crate::api::dto::NotificationImages { images }).into_response())
}

fn uploaded_images(dir: &std::path::Path) -> Vec<crate::api::dto::NotificationImage> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut images: Vec<crate::api::dto::NotificationImage> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            if !is_notification_upload(&name) {
                return None;
            }
            let meta = entry.metadata().ok().filter(std::fs::Metadata::is_file)?;
            let uploaded_at = meta
                .modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()
                .and_then(|d| i64::try_from(d.as_millis()).ok())?;
            Some(crate::api::dto::NotificationImage {
                url: format!("{}{name}", kroma_engine::infra::image::PUBLIC_PREFIX),
                name,
                uploaded_at,
                bytes: meta.len(),
            })
        })
        .collect();
    images.sort_by(|a, b| b.uploaded_at.cmp(&a.uploaded_at).then_with(|| a.name.cmp(&b.name)));
    images.truncate(MAX_LISTED_IMAGES);
    images
}

fn is_notification_upload(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".webp") else {
        return false;
    };
    // Renditions of a cached image chain extensions (`x.webp.w320.webp`).
    if stem.contains('.') {
        return false;
    }
    if stem.starts_with(UPLOAD_PREFIX) {
        return true;
    }
    // Uploads stored before the prefix existed: a 16-hex content hash plus the
    // 1280 cap only this endpoint ever used.
    stem.strip_suffix("-w1280")
        .is_some_and(|hash| hash.len() == 16 && hash.bytes().all(|b| b.is_ascii_hexdigit()))
}

// Uses the same message keys a real producer would, so what lands in the bell
// matches the real thing. Buttons are always LINKS here, even where the real
// notification carries an API action, so a preview never POSTs to a request
// that doesn't exist.
fn sample(event: NotificationEvent, admin: &str) -> NotificationSpec {
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
        .action(link_action("review", "notifications.action.review", "/admin/requests")),
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
        NotificationEvent::MediaAdded => {
            NotificationSpec::new(event, "notifications.media.added.title", "notifications.media.added.body")
                .param("count", "3")
                .link("/")
        }
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
        .action(link_action("review", "notifications.action.review", "/admin/reports")),
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
