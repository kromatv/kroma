//! Wire types for the per-element processing pipeline admin API
//! (`/api/admin/pipeline`) and the `pipeline.stats` live event. Pure data; the
//! engine that produces them lives in `crate::services::pipeline`.

use serde::Serialize;

/// Health counters for one pipeline stage, aggregated from the ledger.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageStat {
    // Short key (`"probe"`); i18n base `pipeline.stage.{stage}`.
    pub stage: String,
    // Full key of the stage's drain job (`"pipeline.probe"`).
    pub key: String,
    pub subject_kind: String,
    pub pending: i64,
    pub running: i64,
    pub done: i64,
    pub failed: i64,
    pub blocked: i64,
}

/// `GET /api/admin/pipeline`: every stage's health, in DAG order.
#[derive(Debug, Clone, Serialize)]
pub struct PipelineView {
    pub stages: Vec<StageStat>,
    pub paused: bool,
}

/// The status of one stage as applied to a single catalog element.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Treatment {
    pub key: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Per-series aggregate over its episodes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpStats {
    pub episodes: i64,
    pub probed: i64,
    pub storyboarded: i64,
    pub seasons: i64,
    pub marker_seasons: i64,
}

/// One catalog element with the status of each treatment applied to it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementRow {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub poster: Option<String>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration_ms: Option<u64>,
    pub season_count: Option<u32>,
    pub treatments: Vec<Treatment>,
    pub overall: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ep_stats: Option<EpStats>,
}

/// Status tally over ALL elements, unfiltered.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementCounts {
    pub total: i64,
    pub ok: i64,
    pub pending: i64,
    pub running: i64,
    pub failed: i64,
    pub film: i64,
    pub series: i64,
    pub episode: i64,
}

/// `GET /api/admin/pipeline/elements`: one filtered, paginated page of the catalog.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineElements {
    pub total: i64,
    pub page: i64,
    pub pages: i64,
    pub counts: ElementCounts,
    pub elements: Vec<ElementRow>,
}

/// `GET /api/admin/pipeline/item|show/:id`: derived from the real artifacts, with
/// the ledger overlaid for in-progress and failed states.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementProcessing {
    pub treatments: Vec<Treatment>,
}

/// One failed (or otherwise notable) ledger row, for the stage drill-down.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineTaskView {
    pub stage: String,
    pub subject_kind: String,
    pub subject_id: String,
    pub title: String,
    pub status: String,
    pub attempts: i64,
    pub error: Option<String>,
    pub finished_at: Option<i64>,
}
