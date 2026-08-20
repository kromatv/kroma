//! The images an admin attaches to a notification: the upload into the shared
//! image store, and the listing of what has been uploaded before.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::model::Permission;
use crate::state::SharedState;

use crate::api::admin::require;

// A notification's image is drawn at ~44px in a list row and at most a phone's
// width in a rich push; a master past this is bytes nobody ever sees.
const IMAGE_MAX_WIDTH: u32 = 1280;

// Uploads share the poster cache's directory; the prefix is what lets the
// listing tell an admin's uploads from thousands of cached posters.
const UPLOAD_PREFIX: &str = "notif-";

const MAX_LISTED_IMAGES: usize = 200;

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
    require(&user, Permission::SettingsManage)?;
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
    require(&user, Permission::SettingsManage)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_content_hash_that_is_not_hexadecimal_is_not_an_upload() {
        assert!(is_notification_upload("0123456789abcdef-w1280.webp"));
        assert!(!is_notification_upload("zzzzzzzzzzzzzzzz-w1280.webp"));
        assert!(!is_notification_upload("0123456789ab-w1280.webp"));
    }

    #[test]
    fn a_missing_images_directory_lists_nothing_rather_than_failing() {
        let scratch = kroma_testing::temp_dir("notif-images");
        assert!(uploaded_images(&scratch.path().join("never-created")).is_empty());
    }
}
