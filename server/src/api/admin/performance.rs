//! Performance admin API (`/api/admin/performance`): what the profiler
//! measured, the slow requests and their waterfalls, what runs right now, the
//! query plan of a core statement, the export, and the switch. Reading needs any
//! admin capability; switching needs `settings.manage`.

use std::path::Path;

use axum::extract::{Path as AxPath, Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use kroma_perf::{Format, Overview, Window, profiler};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::boot::profiling::allowed_by_env;
use crate::model::Permission;
use crate::services::settings::PROFILING_KEY;
use crate::state::SharedState;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/performance", get(overview))
        .route("/performance/slow", get(slow_list))
        .route("/performance/slow/{id}", get(slow_one))
        .route("/performance/live", get(live))
        .route("/performance/segments/{key}/plan", get(plan))
        .route("/performance/export", get(export))
        .route("/performance/enabled", put(switch))
}

#[derive(Deserialize)]
struct WindowQuery {
    window: Option<Window>,
}

#[derive(Deserialize)]
struct ExportQuery {
    window: Option<Window>,
    format: Option<String>,
}

#[derive(Deserialize)]
struct SwitchBody {
    enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OverviewBody {
    #[serde(flatten)]
    overview: Overview,
    switchable: bool,
}

#[derive(Serialize)]
struct PlanStep {
    id: i64,
    parent: i64,
    detail: String,
}

async fn overview(
    AuthUser(user): AuthUser,
    Query(q): Query<WindowQuery>,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let window = q.window.unwrap_or(Window::Hour);
    let overview = blocking(move || Ok(profiler().overview(window))).await?;
    Ok(Json(OverviewBody {
        overview,
        switchable: allowed_by_env(),
    })
    .into_response())
}

async fn slow_list(
    AuthUser(user): AuthUser,
    Query(q): Query<WindowQuery>,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let window = q.window.unwrap_or(Window::Day);
    let requests = blocking(move || Ok(profiler().slow_list(window))).await?;
    Ok(Json(json!({ "requests": requests })).into_response())
}

async fn slow_one(
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let id: u64 = id
        .parse()
        .map_err(|_| json_error(StatusCode::BAD_REQUEST, "not a request id"))?;
    match blocking(move || Ok(profiler().slow_report(id))).await? {
        Some(report) => Ok(Json(report).into_response()),
        None => Err(json_error(StatusCode::NOT_FOUND, "no such slow request")),
    }
}

async fn live(AuthUser(user): AuthUser) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    Ok(Json(json!({ "running": profiler().live_rows() })).into_response())
}

async fn plan(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(key): AxPath<String>,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let key: u64 = key
        .parse()
        .map_err(|_| json_error(StatusCode::BAD_REQUEST, "not a segment key"))?;
    let Some(segment) = profiler().describe(key) else {
        return Err(json_error(StatusCode::NOT_FOUND, "no such segment"));
    };
    if segment.kind != "sql" || segment.origin.as_deref() != Some("core") {
        return Ok(Json(json!({ "plan": null, "error": "only a statement of the core database has a plan here" })).into_response());
    }
    let path = state.config.db_path();
    let planned =
        blocking(move || Ok(explain(&path, &segment.label).map_err(|e| format!("{e:#}")))).await?;
    Ok(match planned {
        Ok(steps) => Json(json!({ "plan": steps, "error": null })),
        Err(error) => Json(json!({ "plan": null, "error": error })),
    }
    .into_response())
}

fn explain(db: &Path, label: &str) -> anyhow::Result<Vec<PlanStep>> {
    anyhow::ensure!(
        !label.ends_with('…'),
        "the statement is too long to have been kept whole"
    );
    let sql = label.replace("?…", "?");
    let connection = Connection::open_with_flags(
        db,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    let mut statement = connection.prepare(&format!("EXPLAIN QUERY PLAN {sql}"))?;
    let steps = statement.query_map([], |row| {
        Ok(PlanStep {
            id: row.get(0)?,
            parent: row.get(1)?,
            detail: row.get(3)?,
        })
    })?;
    Ok(steps.collect::<Result<_, _>>()?)
}

async fn export(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(q): Query<ExportQuery>,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let window = q.window.unwrap_or(Window::Day);
    let (format, mime, extension) = match q.format.as_deref() {
        Some("md" | "markdown") => (Format::Markdown, "text/markdown; charset=utf-8", "md"),
        _ => (
            Format::JsonLines,
            "application/x-ndjson; charset=utf-8",
            "jsonl",
        ),
    };
    let source = json!({
        "product": "KROMA",
        "version": crate::VERSION,
        "build": crate::BUILD,
        "server": state.settings.get_str("serverName", "KROMA"),
    });
    let body = blocking(move || Ok(profiler().export(window, format, source))).await?;
    let disposition = format!(
        "attachment; filename=\"kroma-performance-{}.{extension}\"",
        window.as_str()
    );
    Ok((
        [
            (header::CONTENT_TYPE, mime.to_string()),
            (header::CONTENT_DISPOSITION, disposition),
        ],
        body,
    )
        .into_response())
}

async fn switch(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<SwitchBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    if body.enabled && !allowed_by_env() {
        return Err(json_error(
            StatusCode::CONFLICT,
            "KROMA_PROFILING keeps profiling off on this server",
        ));
    }
    let on = body.enabled;
    let settings = state.settings.clone();
    let pool = state.db.clone();
    blocking(move || settings.set_internal(&pool, PROFILING_KEY, json!(on))).await?;
    profiler().set_enabled(on);
    Ok(Json(json!({ "enabled": on })).into_response())
}

#[cfg(test)]
mod tests {
    use super::explain;

    #[test]
    fn a_statement_with_a_collapsed_list_still_has_a_plan() {
        let dir = kroma_testing::temp_dir("perf-explain");
        let db = dir.path().join("kroma.db");
        rusqlite::Connection::open(&db)
            .unwrap()
            .execute_batch("CREATE TABLE files (id TEXT PRIMARY KEY, item_id TEXT)")
            .unwrap();

        let plan = explain(&db, "SELECT id FROM files WHERE item_id IN (?…)").unwrap();

        assert!(
            plan.iter().any(|step| step.detail.contains("SCAN files")),
            "{:?}",
            plan.iter().map(|s| &s.detail).collect::<Vec<_>>()
        );
    }

    #[test]
    fn a_statement_that_was_cut_has_no_plan() {
        let dir = kroma_testing::temp_dir("perf-explain-cut");

        let refused = explain(&dir.path().join("kroma.db"), "SELECT a, b, c…");

        assert!(refused.is_err());
    }
}
