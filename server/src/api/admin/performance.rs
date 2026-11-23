//! Performance admin API (`/api/admin/performance`): what the profiler
//! measured, the slow requests and their waterfalls, the query plan of a core
//! statement, the export, and the switch. Reading needs any admin capability;
//! switching needs `settings.manage`.

use std::path::Path;

use axum::extract::{Path as AxPath, Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use kroma_perf::{Descriptor, Overview, Window, profiler};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::boot::profiling::{PROFILING_KEY, allowed_by_env};
use crate::model::Permission;
use crate::state::SharedState;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/performance", get(overview))
        .route("/performance/slow", get(slow_list))
        .route("/performance/slow/{id}", get(slow_one))
        .route("/performance/segments/{key}/plan", get(plan))
        .route("/performance/export", get(export))
        .route("/performance/enabled", put(switch))
}

#[derive(Deserialize)]
struct WindowQuery {
    window: Option<Window>,
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
    let report = blocking(move || Ok(id.parse().ok().and_then(|id| profiler().slow_report(id))))
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "no such slow request"))?;
    Ok(Json(report).into_response())
}

async fn plan(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(key): AxPath<String>,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let segment = key
        .parse()
        .ok()
        .and_then(|key| profiler().describe(key))
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "no such segment"))?;
    let path = state.config.db_path();
    let answer = blocking(move || Ok(plan_of(&path, &segment))).await?;
    Ok(Json(answer).into_response())
}

fn plan_of(db: &Path, segment: &Descriptor) -> Value {
    let planned = if segment.kind == "sql" && segment.origin.as_deref() == Some("core") {
        explain(db, &segment.label).map_err(|e| format!("{e:#}"))
    } else {
        Err("only a statement of the core database has a plan here".to_string())
    };
    match planned {
        Ok(steps) => json!({ "plan": steps, "error": null }),
        Err(error) => json!({ "plan": null, "error": error }),
    }
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
    let unbound = std::iter::repeat_n(rusqlite::types::Null, statement.parameter_count());
    let steps = statement.query_map(rusqlite::params_from_iter(unbound), |row| {
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
    Query(q): Query<WindowQuery>,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let window = q.window.unwrap_or(Window::Day);
    let source = json!({
        "product": "KROMA",
        "version": crate::VERSION,
        "build": crate::BUILD,
        "server": state.settings.get_str("serverName", "KROMA"),
    });
    let body = blocking(move || Ok(profiler().export(window, source))).await?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/x-ndjson; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"kroma-performance.jsonl\"",
            ),
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
    use super::{Descriptor, explain, plan_of};

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
    fn only_a_core_statement_is_planned() {
        let dir = kroma_testing::temp_dir("perf-plan-module");
        let segment = Descriptor {
            kind: "sql".into(),
            label: "SELECT 1".into(),
            origin: Some("tv.kroma.acquisition".into()),
        };

        let answer = plan_of(&dir.path().join("kroma.db"), &segment);

        assert!(answer["plan"].is_null());
        assert!(answer["error"].is_string());
    }

    #[test]
    fn a_statement_that_was_cut_has_no_plan() {
        let dir = kroma_testing::temp_dir("perf-explain-cut");

        let refused = explain(&dir.path().join("kroma.db"), "SELECT a, b, c…");

        assert!(refused.is_err());
    }
}
