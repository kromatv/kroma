use std::collections::HashMap;

use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{query, AuthUser, HostStorage};
use serde_json::json;

use crate::admin::invalidate_caps;
use crate::db::{self, IndexerRow};
use crate::{IndexerView, IndexersView};

fn configured_settings(row: &IndexerRow) -> Vec<String> {
    let map: HashMap<String, String> = serde_json::from_str(&row.settings).unwrap_or_default();
    let mut names: Vec<String> = map
        .into_iter()
        .filter(|(_, v)| !v.is_empty())
        .map(|(k, _)| k)
        .collect();
    names.sort();
    names
}

pub(super) fn view_of(row: &IndexerRow) -> IndexerView {
    IndexerView {
        id: row.id.clone(),
        name: row.name.clone(),
        url: row.url.clone(),
        has_api_key: !row.api_key.is_empty(),
        categories: row.categories.clone(),
        enabled: row.enabled,
        priority: row.priority,
        kind: row.kind.clone(),
        definition_id: row.definition_id.clone(),
        configured_settings: configured_settings(row),
        last_ok_at: row.last_ok_at,
        last_error: row.last_error.clone(),
        created_at: row.created_at,
    }
}

/// `GET /indexers`
pub async fn list<S: HostStorage>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let view = query(state.store(), |pool| {
        let conn = pool.get()?;
        let indexers = db::list_indexers(&conn)?.iter().map(view_of).collect();
        Ok(IndexersView { indexers })
    })
    .await?;
    Ok(Json(view).into_response())
}

/// `DELETE /indexers/:id`
pub async fn remove<S: HostStorage + Clone>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let id2 = id.clone();
    let deleted = query(state.store(), move |pool| db::delete_indexer(&pool, &id2)).await?;
    if !deleted {
        return Err(state.lerr(&user, StatusCode::NOT_FOUND, "error.indexerNotFound"));
    }
    invalidate_caps(&id);
    Ok(Json(json!({ "ok": true })).into_response())
}
