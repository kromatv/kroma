use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{blocking, json_error, query, AuthUser, HostStorage};
use kroma_module_sdk::primitives::{now_ms, random_token, short_hash};

use super::indexers::view_of;
use crate::admin::{definition_store, KIND_BUILTIN};
use crate::db::{self, IndexerRow};
use crate::SaveIndexerBody;

/// `POST /indexers` create. `kind: "builtin"` creates a native
/// Cardigann indexer (needs `definitionId`); otherwise a Torznab endpoint
/// (needs `name` + `url`).
pub async fn create<S: HostStorage + Clone>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<SaveIndexerBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let kind = body.kind.as_deref().unwrap_or("torznab").to_string();

    let row = if kind == KIND_BUILTIN {
        build_builtin_row(&state, &body).await?
    } else {
        let name = body
            .name
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .to_string();
        let url = body
            .url
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .to_string();
        if name.is_empty() || url.is_empty() {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "name and url are required",
            ));
        }
        IndexerRow {
            id: new_indexer_id(&url),
            name,
            url,
            api_key: body.api_key.unwrap_or_default().trim().to_string(),
            categories: body.categories.unwrap_or_else(default_cats),
            enabled: body.enabled.unwrap_or(true),
            priority: body.priority.unwrap_or(0),
            kind: "torznab".to_string(),
            definition_id: None,
            settings: "{}".to_string(),
            last_ok_at: None,
            last_error: None,
            created_at: now_ms(),
        }
    };
    let view = view_of(&row);
    query(state.store(), move |pool| db::insert_indexer(&pool, &row)).await?;
    Ok(Json(view).into_response())
}

async fn build_builtin_row<S: HostStorage + Clone>(
    state: &S,
    body: &SaveIndexerBody,
) -> Result<IndexerRow, Response> {
    let def_id = body
        .definition_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            json_error(
                StatusCode::BAD_REQUEST,
                "definitionId is required for a built-in indexer",
            )
        })?
        .to_string();

    let state2 = state.clone();
    let def_id2 = def_id.clone();
    let def = blocking(move || definition_store(&state2).load(&def_id2))
        .await
        .map_err(|_| {
            json_error(
                StatusCode::BAD_REQUEST,
                "unknown definition (sync the catalog first)",
            )
        })?;

    // Base link: admin override, else the definition's first candidate.
    let url = body
        .url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| def.links.first().cloned())
        .ok_or_else(|| {
            json_error(
                StatusCode::BAD_REQUEST,
                "definition has no site link; provide url",
            )
        })?;

    let name = body
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&def.name)
        .to_string();
    let settings = body.settings.clone().unwrap_or_default();

    Ok(IndexerRow {
        id: new_indexer_id(&format!("{def_id}|{url}")),
        name,
        url,
        api_key: String::new(),
        categories: body.categories.clone().unwrap_or_else(default_cats),
        enabled: body.enabled.unwrap_or(true),
        priority: body.priority.unwrap_or(0),
        kind: KIND_BUILTIN.to_string(),
        definition_id: Some(def_id),
        settings: serde_json::to_string(&settings).unwrap_or_else(|_| "{}".to_string()),
        last_ok_at: None,
        last_error: None,
        created_at: now_ms(),
    })
}

fn new_indexer_id(seed: &str) -> String {
    short_hash(&format!("indexer|{seed}|{}", random_token()))
}

fn default_cats() -> Vec<u32> {
    vec![2000, 5000]
}
