//! `/api/admin/backup/schedule`: the backups the server saves by itself. The
//! `backup.save` job saves them, so its runs and their failures are the job
//! console's, under `/api/admin/jobs/backup.save`.

use std::collections::BTreeMap;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Response;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::i18n;
use crate::infra::events::ServerEvent;
use crate::model::{Permission, User};
use crate::services::backup::schedule::{self, MAX_KEEP, Schedule};
use crate::services::folders::{self, FolderRefusal};
use crate::state::SharedState;

/// What the owner changed. A field left out stays as it is, and an empty
/// `folder` goes back to the data folder's own.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleChange {
    enabled: Option<bool>,
    folder: Option<String>,
    keep: Option<u32>,
}

fn refused(user: &User, key: &str) -> Response {
    lerr(i18n::user_locale(user), StatusCode::BAD_REQUEST, key)
}

fn folder_value(user: &User, folder: &str) -> Result<Value, Response> {
    if folder.trim().is_empty() {
        return Ok(json!(""));
    }
    match folders::picked_folder(folder) {
        Ok(picked) => Ok(json!(picked.to_string_lossy())),
        Err(FolderRefusal::Outside) => Err(refused(user, "admin.backupFolderOutside")),
        Err(FolderRefusal::Missing) => Err(refused(user, "admin.backupFolderMissing")),
    }
}

fn patch_of(user: &User, change: ScheduleChange) -> Result<BTreeMap<String, Value>, Response> {
    let mut patch = BTreeMap::new();
    if let Some(enabled) = change.enabled {
        patch.insert(schedule::ENABLED_KEY.to_string(), json!(enabled));
    }
    if let Some(folder) = change.folder {
        patch.insert(
            schedule::FOLDER_KEY.to_string(),
            folder_value(user, &folder)?,
        );
    }
    if let Some(keep) = change.keep {
        if !(1..=MAX_KEEP).contains(&keep) {
            return Err(refused(user, "admin.backupKeepRange"));
        }
        patch.insert(schedule::KEEP_KEY.to_string(), json!(keep));
    }
    Ok(patch)
}

/// `GET /api/admin/backup/schedule`: whether the server saves backups by
/// itself, where, and how many it keeps.
pub async fn read_schedule(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Schedule>, Response> {
    crate::api::permission::require(&user, Permission::SettingsManage)?;
    Ok(Json(schedule::schedule(
        &state.settings,
        &state.config.data_dir,
    )))
}

/// `PUT /api/admin/backup/schedule`: turns the backups on or off, picks their
/// folder and how many to keep. 400 for a folder the folder picker would not
/// offer, and for a count outside 1 to 365.
pub async fn change_schedule(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(change): Json<ScheduleChange>,
) -> Result<Json<Schedule>, Response> {
    crate::api::permission::require(&user, Permission::SettingsManage)?;
    let written = state.clone();
    blocking(move || {
        Ok(patch_of(&user, change).map(|patch| written.settings.set_patch(&written.db, patch)))
    })
    .await??;
    state.events.publish(ServerEvent::SettingsUpdated);
    Ok(Json(schedule::schedule(
        &state.settings,
        &state.config.data_dir,
    )))
}
