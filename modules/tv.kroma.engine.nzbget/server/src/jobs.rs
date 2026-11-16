use serde::Deserialize;

use crate::types::{JobState, JobStatus};

const PROCESSING: &[&str] = &[
    "PP_QUEUED",
    "LOADING_PARS",
    "VERIFYING_SOURCES",
    "REPAIRING",
    "VERIFYING_REPAIRED",
    "RENAMING",
    "UNPACKING",
    "MOVING",
    "POST_UNPACK_RENAMING",
    "POST_DOWNLOAD_RENAMING",
    "EXECUTING_SCRIPT",
    "PP_FINISHED",
];

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "PascalCase")]
pub(crate) struct Group {
    #[serde(rename = "NZBID")]
    pub(crate) id: i64,
    #[serde(rename = "NZBName")]
    name: String,
    status: String,
    dest_dir: String,
    final_dir: String,
    file_size_lo: u64,
    file_size_hi: u64,
    remaining_size_lo: u64,
    remaining_size_hi: u64,
    paused_size_lo: u64,
    paused_size_hi: u64,
    downloaded_size_lo: u64,
    downloaded_size_hi: u64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "PascalCase")]
pub(crate) struct HistoryItem {
    #[serde(rename = "NZBID")]
    pub(crate) id: i64,
    name: String,
    status: String,
    dest_dir: String,
    final_dir: String,
    file_size_lo: u64,
    file_size_hi: u64,
    downloaded_size_lo: u64,
    downloaded_size_hi: u64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "PascalCase")]
pub(crate) struct ServerStatus {
    download_rate: u64,
    download_rate_lo: u64,
    download_rate_hi: u64,
}

impl ServerStatus {
    pub(crate) fn download_rate(&self) -> u64 {
        if self.download_rate_lo | self.download_rate_hi != 0 {
            join(self.download_rate_lo, self.download_rate_hi)
        } else {
            self.download_rate
        }
    }
}

fn join(lo: u64, hi: u64) -> u64 {
    (u64::from(hi as u32) << 32) | u64::from(lo as u32)
}

fn ratio(part: u64, whole: u64) -> f64 {
    if whole == 0 {
        0.0
    } else {
        (part as f64 / whole as f64).clamp(0.0, 1.0)
    }
}

fn save_path(final_dir: &str, dest_dir: &str) -> Option<String> {
    [final_dir, dest_dir]
        .into_iter()
        .find(|dir| !dir.is_empty())
        .map(str::to_string)
}

fn job(client_ref: i64, name: &str) -> JobStatus {
    JobStatus {
        client_ref: client_ref.to_string(),
        name: name.to_string(),
        info_hash: None,
        progress: 0.0,
        state: JobState::Queued,
        down_bps: 0,
        up_bps: 0,
        peers: 0,
        peers_seen: 0,
        size_bytes: 0,
        save_path: None,
        files: Vec::new(),
        error: None,
        lifetime_downloaded_bytes: 0,
        lifetime_uploaded_bytes: 0,
    }
}

impl Group {
    pub(crate) fn is_downloading(&self) -> bool {
        self.status == "DOWNLOADING"
    }

    pub(crate) fn into_status(self, rate: u64) -> JobStatus {
        let size = join(self.file_size_lo, self.file_size_hi);
        let state = match self.status.as_str() {
            "PAUSED" => JobState::Paused,
            "DOWNLOADING" => JobState::Downloading,
            s if PROCESSING.contains(&s) => JobState::Processing,
            _ => JobState::Queued,
        };
        let progress = match state {
            JobState::Processing => 1.0,
            _ => {
                let wanted = size.saturating_sub(join(self.paused_size_lo, self.paused_size_hi));
                let left = join(self.remaining_size_lo, self.remaining_size_hi);
                ratio(size.saturating_sub(left), wanted)
            }
        };
        JobStatus {
            progress,
            state,
            down_bps: if state == JobState::Downloading { rate } else { 0 },
            size_bytes: size,
            save_path: save_path(&self.final_dir, &self.dest_dir),
            lifetime_downloaded_bytes: join(self.downloaded_size_lo, self.downloaded_size_hi),
            ..job(self.id, &self.name)
        }
    }
}

impl HistoryItem {
    pub(crate) fn into_status(self) -> JobStatus {
        let size = join(self.file_size_lo, self.file_size_hi);
        let downloaded = join(self.downloaded_size_lo, self.downloaded_size_hi);
        let completed = self.status.starts_with("SUCCESS") || self.status == "WARNING/SCRIPT";
        JobStatus {
            progress: if completed { 1.0 } else { ratio(downloaded, size) },
            state: if completed {
                JobState::Completed
            } else {
                JobState::Failed
            },
            size_bytes: size,
            save_path: save_path(&self.final_dir, &self.dest_dir),
            error: (!completed).then(|| format!("NZBGet ended the job as {}", self.status)),
            lifetime_downloaded_bytes: downloaded,
            ..job(self.id, &self.name)
        }
    }
}

#[cfg(test)]
mod tests;
