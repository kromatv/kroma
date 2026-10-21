use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{blocking, AuthUser, HostStorage};

use crate::admin::{any_indexer_caps, builtin_session, invalidate_caps, KIND_BUILTIN};
use crate::db;
use crate::IndexerTestResult;

/// `POST /indexers/:id/test`. Torznab: a live `t=caps` round-trip.
/// Built-in: derive caps from the definition and verify login/reachability.
pub async fn test<S: HostStorage + Clone>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    invalidate_caps(&id);
    let host = state.clone();
    let result = blocking(move || {
        let conn = host.store().get()?;
        let Some(row) = db::get_indexer(&conn, &id)? else {
            return Ok(None);
        };
        drop(conn);
        let started = std::time::Instant::now();
        let caps = any_indexer_caps(&host, host.store(), &row);
        let reachable = if row.kind == KIND_BUILTIN {
            // Verify the session (drives a login for private trackers).
            builtin_session(&host, &row)
                .and_then(|s| s.test())
                .map(|_| ())
        } else {
            caps.as_ref()
                .map(|_| ())
                .map_err(|e| anyhow::anyhow!("{e:#}"))
        };
        let latency_ms = started.elapsed().as_millis() as u64;
        Ok(Some(match (reachable, caps) {
            (Ok(()), Ok(caps)) => IndexerTestResult {
                ok: true,
                latency_ms,
                server_title: caps.server_title,
                supports_tmdb: caps.search_tmdb || caps.tv_search_tmdb,
                error: None,
            },
            (Err(e), _) | (_, Err(e)) => IndexerTestResult {
                ok: false,
                latency_ms,
                server_title: None,
                supports_tmdb: false,
                error: Some(format!("{e:#}")),
            },
        }))
    })
    .await?;
    match result {
        Some(r) => Ok(Json(r).into_response()),
        None => Err(state.lerr(&user, StatusCode::NOT_FOUND, "error.indexerNotFound")),
    }
}
