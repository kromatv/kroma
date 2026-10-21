use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{blocking, json_error, AuthUser, HostStorage};

use crate::admin::definition_store;
use crate::{
    IndexerDefinitionDetailView, IndexerDefinitionSettingView, IndexerDefinitionView,
    IndexerDefinitionsView, SyncDefinitionsResult,
};

/// `GET /indexers/definitions` the browsable Cardigann catalog.
pub async fn list_definitions<S: HostStorage + Clone>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let host = state.clone();
    let view = blocking(move || {
        let store = definition_store(&host);
        let synced = store.is_populated();
        let definitions = store
            .list()
            .unwrap_or_default()
            .into_iter()
            .map(|m| IndexerDefinitionView {
                id: m.id,
                name: m.name,
                kind: m.kind,
                description: m.description,
                links: m.links,
            })
            .collect();
        anyhow::Ok(IndexerDefinitionsView {
            definitions,
            synced,
        })
    })
    .await?;
    Ok(Json(view).into_response())
}

/// `GET /indexers/definitions/:defId` the settings schema for the form.
pub async fn definition_detail<S: HostStorage + Clone>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(def_id): AxPath<String>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let host = state.clone();
    let detail = blocking(move || {
        definition_store(&host)
            .load(&def_id)
            .map(|def| IndexerDefinitionDetailView {
                id: def.id.clone(),
                name: def.name.clone(),
                kind: def.kind.clone(),
                description: def.description.clone(),
                links: def.links.clone(),
                settings: def
                    .settings
                    .iter()
                    .map(|s| IndexerDefinitionSettingView {
                        name: s.name.clone(),
                        kind: s.kind.clone(),
                        label: s.label.clone().unwrap_or_else(|| s.name.clone()),
                        default: s.default.clone(),
                        options: s
                            .options
                            .iter()
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .collect(),
                    })
                    .collect(),
            })
    })
    .await;
    match detail {
        Ok(d) => Ok(Json(d).into_response()),
        Err(_) => Err(json_error(StatusCode::NOT_FOUND, "unknown definition")),
    }
}

/// `POST /indexers/definitions/sync` fetch the current definition set.
pub async fn sync_definitions<S: HostStorage + Clone>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let host = state.clone();
    // Not via `blocking`: we want the real network/extract error message to reach
    // the admin, and `blocking` collapses errors to a generic 500.
    let report = tokio::task::spawn_blocking(move || definition_store(&host).sync())
        .await
        .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "sync task failed"))?
        .map_err(|e| json_error(StatusCode::BAD_GATEWAY, &format!("sync failed: {e:#}")))?;
    Ok(Json(SyncDefinitionsResult {
        count: report.count,
        version: report.version,
    })
    .into_response())
}
