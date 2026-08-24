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
    Audience, Notification, NotificationCategory, NotificationEvent, NotificationSpec, Permission,
};
use crate::state::SharedState;

mod images;
mod samples;

use images::{list_images, upload_image};
use samples::sample;

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
    if let Some(title) = body
        .title
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
    {
        let category = match body.category.as_deref() {
            None => NotificationCategory::System,
            Some(raw) => NotificationCategory::parse(raw).ok_or("unknown notification category")?,
        };
        let text = body.body.clone().unwrap_or_default();
        within(title, MAX_TITLE, "title is too long")?;
        within(&text, MAX_BODY, "body is too long")?;

        let mut spec = NotificationSpec::custom(category, title, text);
        if let Some(link) = body
            .link
            .as_deref()
            .map(str::trim)
            .filter(|l| !l.is_empty())
        {
            within(link, MAX_LINK, "link is too long")?;
            spec = spec.link(link);
        }
        let image = body
            .image_url
            .as_deref()
            .map(str::trim)
            .filter(|u| !u.is_empty());
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

#[cfg(test)]
mod tests {
    use super::*;

    fn body(title: Option<&str>, text: Option<&str>) -> SendBody {
        SendBody {
            event: None,
            title: title.map(str::to_string),
            body: text.map(str::to_string),
            category: None,
            link: None,
            image_url: None,
            target: Target::Me,
        }
    }

    fn param(spec: &NotificationSpec, key: &str) -> String {
        spec.params.get(key).expect("param").resolve(|_| None)
    }

    #[test]
    fn an_emoji_costs_two_of_the_title_budget_because_the_relay_counts_utf16() {
        assert_eq!(wire_len("abc"), 3);
        assert_eq!(wire_len("\u{1f4fa}"), 2);

        let just_fits = "\u{1f4fa}".repeat(MAX_TITLE / 2);
        assert_eq!(just_fits.chars().count(), MAX_TITLE / 2);
        assert!(compose(&body(Some(&just_fits), None), "owner").is_ok());

        let one_too_many = "\u{1f4fa}".repeat(MAX_TITLE / 2 + 1);
        assert!(one_too_many.chars().count() < MAX_TITLE);
        assert_eq!(
            compose(&body(Some(&one_too_many), None), "owner").err(),
            Some("title is too long")
        );
    }

    #[test]
    fn a_blank_title_falls_through_to_the_named_event() {
        let mut blank = body(Some("   "), Some("ignored"));
        blank.event = Some("media.added".into());
        let spec = compose(&blank, "owner").expect("compose");
        assert_eq!(spec.event, NotificationEvent::MediaAdded);
        assert_eq!(spec.title_key, "notifications.media.added.title");
    }

    #[test]
    fn a_written_title_wins_over_a_named_event() {
        let mut both = body(Some("  Maintenance  "), Some("At nine."));
        both.event = Some("media.added".into());
        let spec = compose(&both, "owner").expect("compose");
        assert_eq!(spec.event, NotificationEvent::Custom);
        assert_eq!(param(&spec, "title"), "Maintenance");
        assert_eq!(param(&spec, "body"), "At nine.");
        assert_eq!(spec.category(), NotificationCategory::System);
    }

    #[test]
    fn a_blank_link_or_image_is_dropped_rather_than_stored_empty() {
        let mut spaces = body(Some("Hello"), None);
        spaces.link = Some("   ".into());
        spaces.image_url = Some("".into());
        let spec = compose(&spaces, "owner").expect("compose");
        assert_eq!(spec.link, None);
        assert_eq!(spec.image_url, None);
    }

    #[test]
    fn the_custom_events_own_sample_is_an_empty_composer() {
        let mut named = body(None, None);
        named.event = Some("custom".into());
        let spec = compose(&named, "owner").expect("compose");
        assert_eq!(spec.event, NotificationEvent::Custom);
        assert_eq!(spec.link, None);
        assert!(spec.actions.is_empty());
    }
}
