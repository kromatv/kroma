use rusqlite::Row;

mod read;
mod write;

pub use read::*;
pub use write::*;

/// A stored download row.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DownloadRow {
    pub id: String,
    pub client_id: String,
    pub client_ref: String,
    pub request_id: Option<String>,
    pub kind: String,
    pub tmdb_id: u64,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
    pub release_title: String,
    pub indexer_id: Option<String>,
    pub info_hash: Option<String>,
    pub magnet_or_url: String,
    pub size_bytes: Option<u64>,
    pub score: Option<i32>,
    pub score_breakdown: Option<String>,
    pub status: String,
    pub progress: f64,
    pub save_path: Option<String>,
    // Persisted for the record / a future "reveal in library"; not read yet.
    #[allow(dead_code)]
    pub imported_paths: Option<Vec<String>>,
    pub error: Option<String>,
    pub grabbed_at: i64,
    pub completed_at: Option<i64>,
    pub imported_at: Option<i64>,
    pub details_url: Option<String>,
    pub only_files: Option<Vec<usize>>,
    /// Replaces media already on disk (see [`GrabSpec::upgrade`]).
    #[serde(default)]
    pub upgrade: bool,
}

const DL_COLS: &str = "id, client_id, client_ref, request_id, kind, tmdb_id, title, year, \
    season, episodes, release_title, indexer_id, info_hash, magnet_or_url, size_bytes, score, \
    score_breakdown, status, progress, save_path, imported_paths, error, grabbed_at, \
    completed_at, imported_at, details_url, only_files, upgrade";

fn row_to_download(r: &Row) -> rusqlite::Result<DownloadRow> {
    let episodes: Option<String> = r.get(9)?;
    let imported: Option<String> = r.get(20)?;
    Ok(DownloadRow {
        id: r.get(0)?,
        client_id: r.get(1)?,
        client_ref: r.get(2)?,
        request_id: r.get(3)?,
        kind: r.get(4)?,
        tmdb_id: r.get::<_, i64>(5)? as u64,
        title: r.get(6)?,
        year: r.get(7)?,
        season: r.get(8)?,
        episodes: episodes.and_then(|j| serde_json::from_str(&j).ok()),
        release_title: r.get(10)?,
        indexer_id: r.get(11)?,
        info_hash: r.get(12)?,
        magnet_or_url: r.get(13)?,
        size_bytes: r.get::<_, Option<i64>>(14)?.map(|v| v as u64),
        score: r.get(15)?,
        score_breakdown: r.get(16)?,
        status: r.get(17)?,
        progress: r.get(18)?,
        save_path: r.get(19)?,
        imported_paths: imported.and_then(|j| serde_json::from_str(&j).ok()),
        error: r.get(21)?,
        grabbed_at: r.get(22)?,
        completed_at: r.get(23)?,
        imported_at: r.get(24)?,
        details_url: r.get(25)?,
        only_files: r
            .get::<_, Option<String>>(26)?
            .and_then(|j| serde_json::from_str(&j).ok()),
        upgrade: r.get::<_, i64>(27)? != 0,
    })
}
