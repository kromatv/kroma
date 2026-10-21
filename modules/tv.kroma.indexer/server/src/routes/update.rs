use std::collections::HashMap;

use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{blocking, query, AuthUser, HostStorage};

use super::indexers::view_of;
use crate::admin::{definition_store, invalidate_caps};
use crate::db;
use crate::SaveIndexerBody;

/// `PUT /indexers/:id` partial update. For built-in rows the `settings`
/// map is merged into the stored one (an omitted/empty password keeps its value).
pub async fn update<S: HostStorage + Clone>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
    Json(body): Json<SaveIndexerBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;

    // Merge settings for built-in rows (needs the current row + definition to
    // preserve secrets).
    let merged_settings = if let Some(incoming) = &body.settings {
        let state2 = state.clone();
        let id2 = id.clone();
        let incoming = incoming.clone();
        Some(blocking(move || merge_settings(&state2, &id2, &incoming)).await?)
    } else {
        None
    };

    let id2 = id.clone();
    let updated = query(state.store(), move |pool| {
        db::update_indexer(
            &pool,
            &id2,
            body.name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty()),
            body.url.as_deref().map(str::trim).filter(|s| !s.is_empty()),
            body.api_key
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty()),
            body.categories.as_deref(),
            body.enabled,
            body.priority,
            merged_settings.as_deref(),
        )
    })
    .await?;
    if !updated {
        return Err(state.lerr(&user, StatusCode::NOT_FOUND, "error.indexerNotFound"));
    }
    invalidate_caps(&id);
    let id3 = id.clone();
    let row = query(state.store(), move |pool| {
        let conn = pool.get()?;
        Ok(db::get_indexer(&conn, &id3)?)
    })
    .await?;
    match row {
        Some(r) => Ok(Json(view_of(&r)).into_response()),
        None => Err(state.lerr(&user, StatusCode::NOT_FOUND, "error.indexerNotFound")),
    }
}

// Preserves a stored password when the incoming value for a `password`-type
// setting is empty.
fn merge_settings<S: HostStorage>(
    state: &S,
    id: &str,
    incoming: &HashMap<String, String>,
) -> anyhow::Result<String> {
    let conn = state.store().get()?;
    let row = db::get_indexer(&conn, id)?.ok_or_else(|| anyhow::anyhow!("indexer not found"))?;
    drop(conn);
    let mut current: HashMap<String, String> =
        serde_json::from_str(&row.settings).unwrap_or_default();

    // Which settings are secret (password), per the definition.
    let secret: std::collections::HashSet<String> = row
        .definition_id
        .as_deref()
        .and_then(|d| definition_store(state).load(d).ok())
        .map(|def| {
            def.settings
                .iter()
                .filter(|s| s.kind == "password")
                .map(|s| s.name.clone())
                .collect()
        })
        .unwrap_or_default();

    for (k, v) in incoming {
        if v.is_empty() && secret.contains(k) {
            continue; // keep the stored secret
        }
        current.insert(k.clone(), v.clone());
    }
    Ok(serde_json::to_string(&current)?)
}
