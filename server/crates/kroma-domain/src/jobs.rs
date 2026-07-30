//! Wire types for the background-job admin API (`/api/admin/jobs`). Timestamps
//! are epoch **milliseconds**.

use serde::Serialize;

/// UI grouping bucket. Serializes lowercase into the `jobs.cat.{category}` i18n key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Maintenance,
    Library,
    Recommendations,
    Pipeline,
    Acquisition,
}

impl std::str::FromStr for Category {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "maintenance" => Ok(Self::Maintenance),
            "library" => Ok(Self::Library),
            "recommendations" => Ok(Self::Recommendations),
            "pipeline" => Ok(Self::Pipeline),
            "acquisition" => Ok(Self::Acquisition),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRun {
    pub id: String,
    pub job_key: String,
    pub trigger: String,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub duration_ms: Option<i64>,
    pub progress_done: Option<i64>,
    pub progress_total: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobLog {
    pub ts: i64,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobInfo {
    // Stable dotted key (`"library.scan"`): the DB key, the
    // `/api/admin/jobs/:key` segment, and the i18n base for `name` /
    // `description` (`jobs.{key}.name` / `.desc`).
    pub key: String,
    pub name: String,
    pub description: String,
    pub category: Category,
    // Cron expression; `None` means manual-only.
    pub schedule: Option<String>,
    pub default_schedule: Option<String>,
    pub customized: bool,
    pub enabled: bool,
    pub running: bool,
    pub run_id: Option<String>,
    pub progress_done: Option<i64>,
    pub progress_total: Option<i64>,
    pub next_run_at: Option<i64>,
    pub last_run: Option<JobRun>,
}

/// `GET /api/admin/jobs`.
#[derive(Debug, Clone, Serialize)]
pub struct JobsView {
    pub jobs: Vec<JobInfo>,
}

/// `GET /api/admin/jobs/:key`.
#[derive(Debug, Clone, Serialize)]
pub struct JobDetail {
    pub info: JobInfo,
    pub runs: Vec<JobRun>,
}
