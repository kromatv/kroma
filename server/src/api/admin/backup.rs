//! Portable backup: export the server's identity state (accounts, settings,
//! history, resume positions, invites, cron overrides, custom avatars) as a ZIP
//! optionally password-encrypted and import it on another server. Import
//! restores the rows, reloads the settings store, then kicks a re-scan so the
//! catalogue regenerates with the same item IDs (the library defs travel inside
//! `settings`). See [`crate::services::backup`].

use axum::body::{Body, Bytes};
use axum::extract::{FromRequest, Request, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::api::error::{json_error, lerr, lerr_with};
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::infra::events::ServerEvent;
use crate::model::Permission;
use crate::services::backup::ImportError;
use crate::state::SharedState;
use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::Router;

mod schedule;

/// Backup export / import. Paths are relative to the `/api/admin` nest.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/backup/export", get(export_backup))
        .route(
            "/backup/schedule",
            get(schedule::read_schedule).put(schedule::change_schedule),
        )
        .route(
            "/backup/import",
            post(import_backup).layer(DefaultBodyLimit::max(MAX_BACKUP_BYTES)),
        )
        .route(
            "/backup/import/preview",
            post(preview_backup).layer(DefaultBodyLimit::max(MAX_BACKUP_BYTES)),
        )
}

// The whole `.kroma` is buffered in memory; lift axum's 2 MiB default so a
// large library (many accounts/avatars) isn't rejected with an opaque 413.
pub const MAX_BACKUP_BYTES: usize = 256 * 1024 * 1024;

// Hex-encoded so an arbitrary (non-ASCII) password survives an HTTP header.
fn header_password(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get("x-backup-password")?.to_str().ok()?;
    let bytes = hex::decode(raw).ok()?;
    let s = String::from_utf8(bytes).ok()?;
    (!s.is_empty()).then_some(s)
}

fn header_flag(headers: &HeaderMap, name: &str) -> bool {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

/// `GET /api/admin/backup/export` → download a `.kroma` backup (encrypted when a
/// `X-Backup-Password` header is sent, otherwise a compressed archive both
/// share the extension and the import auto-detects). Contains credentials
/// (password hashes, API keys) → gated by `SettingsManage`.
pub async fn export_backup(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let data_dir = state.config.data_dir.clone();
    let password = header_password(&headers);
    let bytes = query(&state.db, move |pool| {
        crate::services::backup::export(&pool, &data_dir, password.as_deref())
    })
    .await?;

    let ts = crate::services::scan::now_iso8601().replace(':', "-");
    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"kroma-backup-{ts}.kroma\""),
        )
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(bytes))
        .unwrap())
}

/// What a restore reads from the request: the file, its password, whether it
/// resets, and how it treats this server's libraries.
pub struct Restore {
    bytes: Vec<u8>,
    password: Option<String>,
    plan: crate::services::backup::Plan,
}

impl FromRequest<SharedState> for Restore {
    type Rejection = Response;

    async fn from_request(request: Request, state: &SharedState) -> Result<Self, Response> {
        let reset = header_flag(request.headers(), "x-backup-reset");
        let password = header_password(request.headers());
        let body = Bytes::from_request(request, state)
            .await
            .map_err(IntoResponse::into_response)?;
        Ok(Restore {
            bytes: body.to_vec(),
            password,
            plan: crate::services::backup::Plan::for_server(&state.settings, &state.config, reset),
        })
    }
}

/// `POST /api/admin/backup/import/preview` with the body and headers of an
/// import → `{ removedLibraries }`: the libraries of this server that restoring
/// the file would remove, each `{ id, name }`. Restores nothing.
/// `SettingsManage`.
pub async fn preview_backup(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    restore: Restore,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let locale = super::user_locale(&user);
    let pool = state.db.clone();
    let outcome = tokio::task::spawn_blocking(move || {
        let backup = crate::services::backup::Backup {
            bytes: &restore.bytes,
            password: restore.password.as_deref(),
        };
        crate::services::backup::preview(&pool, &backup, &restore.plan)
    })
    .await;
    let removed = refused(&state, locale, outcome).await?;
    let removed: Vec<serde_json::Value> = removed
        .into_iter()
        .map(|library| json!({ "id": library.id, "name": library.name }))
        .collect();
    Ok(Json(json!({ "removedLibraries": removed })).into_response())
}

/// `POST /api/admin/backup/import` body = a backup file (`.kroma`/`.zip`/legacy
/// `.json`) → restore it, then re-scan. `X-Backup-Password` decrypts an encrypted
/// file; `X-Backup-Reset: 1` wipes the portable tables first (clean A→B clone)
/// and restores the backup's library list in place of this server's. Without
/// it, the backup's libraries join this server's and none is removed.
/// `SettingsManage`.
pub async fn import_backup(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    restore: Restore,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let locale = super::user_locale(&user);
    let pool = state.db.clone();
    let data_dir = state.config.data_dir.clone();
    let outcome = tokio::task::spawn_blocking(move || {
        crate::services::backup::import(
            &pool,
            &data_dir,
            &restore.bytes,
            restore.password.as_deref(),
            &restore.plan,
        )
    })
    .await;
    let summary = refused(&state, locale, outcome).await?;

    // Reflect the restored config, then regenerate the catalogue (same item IDs)
    // so progress/history re-link to their items. Route through the job manager so
    // the rescan shares the single-flight guard with /api/scan and watch-triggered
    // runs, instead of racing a second walk + sync on the same DB.
    state.settings.reload(&state.db);
    state.jobs.reload_schedules(&state.db);
    state.events.publish(ServerEvent::SettingsUpdated);
    let rescan_started = !matches!(
        state.jobs.trigger(
            state.clone(),
            crate::services::jobs::JobKey("library.scan"),
            "backup-import"
        ),
        Err(crate::services::jobs::TriggerError::Unknown)
    );

    let counts: serde_json::Map<String, serde_json::Value> =
        summary.into_iter().map(|(t, n)| (t, json!(n))).collect();
    Ok(Json(json!({ "imported": counts, "rescanStarted": rescan_started })).into_response())
}

async fn refused<T>(
    state: &SharedState,
    locale: &str,
    outcome: Result<Result<T, ImportError>, tokio::task::JoinError>,
) -> Result<T, Response> {
    match outcome {
        Ok(Ok(done)) => Ok(done),
        Ok(Err(error)) => Err(answer(state, locale, error).await),
        Err(e) => {
            tracing::error!(error = %e, "backup import task join error");
            Err(internal())
        }
    }
}

async fn answer(state: &SharedState, locale: &str, error: ImportError) -> Response {
    match error {
        ImportError::LibraryListUnreadable => unreadable_list(state, locale).await,
        ImportError::Db(e) => {
            tracing::error!(error = %e, "backup import database error");
            internal()
        }
        other => rejected(locale, &other),
    }
}

fn rejected(locale: &str, error: &ImportError) -> Response {
    if let ImportError::Invalid(e) = error {
        tracing::warn!(error = %e, "rejected backup import");
    }
    let key = match error {
        ImportError::PasswordRequired => "admin.backupPasswordRequired",
        ImportError::WrongPassword => "admin.backupWrongPassword",
        _ => "admin.backupInvalid",
    };
    lerr(locale, StatusCode::BAD_REQUEST, key)
}

async fn unreadable_list(state: &SharedState, locale: &str) -> Response {
    let notice = query(&state.db, |pool| {
        Ok(crate::services::settings::unreadable_list_notice(&pool))
    })
    .await;
    match notice {
        Ok(notice) => lerr_with(
            locale,
            StatusCode::CONFLICT,
            notice.key,
            &[("libraries", &notice.libraries)],
        ),
        Err(response) => response,
    }
}

fn internal() -> Response {
    json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error")
}
