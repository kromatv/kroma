//! SABnzbd's queue and history replies, read tolerantly, and the mapping of one
//! job in either onto a [`JobStatus`].

use serde::de::IgnoredAny;
use serde::{Deserialize, Deserializer};

use crate::types::{JobState, JobStatus};

const MIB: f64 = 1_048_576.0;

#[derive(Deserialize)]
#[serde(untagged)]
enum Lenient {
    Num(f64),
    Text(String),
    Other(IgnoredAny),
}

fn lenient<'de, D: Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    Ok(match Lenient::deserialize(d)? {
        Lenient::Num(n) => n,
        Lenient::Text(s) => s.trim().parse().unwrap_or(0.0),
        Lenient::Other(_) => 0.0,
    })
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct QueueReply {
    pub queue: Queue,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Queue {
    #[serde(deserialize_with = "lenient")]
    kbpersec: f64,
    slots: Vec<QueueSlot>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct QueueSlot {
    nzo_id: String,
    status: String,
    filename: String,
    #[serde(deserialize_with = "lenient")]
    mb: f64,
    #[serde(deserialize_with = "lenient")]
    mbleft: f64,
    #[serde(deserialize_with = "lenient")]
    percentage: f64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct HistoryReply {
    pub history: History,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct History {
    slots: Vec<HistorySlot>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct HistorySlot {
    nzo_id: String,
    status: String,
    name: String,
    storage: String,
    fail_message: String,
    #[serde(deserialize_with = "lenient")]
    bytes: f64,
    #[serde(deserialize_with = "lenient")]
    downloaded: f64,
}

pub fn from_queue(queue: &Queue, id: &str) -> Option<JobStatus> {
    let slot = queue.slots.iter().find(|s| s.nzo_id == id)?;
    let state = match slot.status.as_str() {
        "Paused" => JobState::Paused,
        "Downloading" | "Fetching" => JobState::Downloading,
        _ => JobState::Queued,
    };
    let raw = if slot.mb > 0.0 {
        (slot.mb - slot.mbleft) / slot.mb
    } else {
        slot.percentage / 100.0
    };
    let down_bps = if slot.status == "Downloading" {
        (queue.kbpersec * 1024.0).max(0.0) as u64
    } else {
        0
    };
    Some(JobStatus {
        client_ref: id.to_string(),
        name: slot.filename.clone(),
        progress: raw.clamp(0.0, 1.0),
        state,
        down_bps,
        size_bytes: (slot.mb * MIB) as u64,
        save_path: None,
        error: None,
        downloaded_bytes: ((slot.mb - slot.mbleft).max(0.0) * MIB) as u64,
    })
}

pub fn from_history(history: &History, id: &str) -> Option<JobStatus> {
    let slot = history.slots.iter().find(|s| s.nzo_id == id)?;
    let (state, progress, error) = match slot.status.as_str() {
        "Completed" if !slot.storage.is_empty() => (JobState::Completed, 1.0, None),
        "Failed" => {
            let reason = match slot.fail_message.trim() {
                "" => "SABnzbd failed the job",
                message => message,
            };
            (JobState::Failed, 0.0, Some(reason.to_string()))
        }
        _ => (JobState::Processing, 1.0, None),
    };
    let save_path = (state == JobState::Completed && !slot.storage.is_empty())
        .then(|| slot.storage.clone());
    let downloaded = if slot.downloaded > 0.0 {
        slot.downloaded
    } else {
        slot.bytes
    };
    Some(JobStatus {
        client_ref: id.to_string(),
        name: slot.name.clone(),
        progress,
        state,
        down_bps: 0,
        size_bytes: slot.bytes.max(0.0) as u64,
        save_path,
        error,
        downloaded_bytes: downloaded.max(0.0) as u64,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn queue(slot_status: &str) -> Queue {
        let reply: QueueReply = serde_json::from_value(json!({
            "queue": {
                "kbpersec": "1024.0",
                "slots": [{
                    "nzo_id": "nzo_a", "status": slot_status, "filename": "A.Film",
                    "mb": "1000.0", "mbleft": "250.0", "percentage": "75",
                }],
            }
        }))
        .unwrap();
        reply.queue
    }

    fn history(slot_status: &str, fail_message: &str) -> History {
        history_with(slot_status, fail_message, "/complete/A.Film")
    }

    fn history_at(slot_status: &str, storage: &str) -> History {
        history_with(slot_status, "", storage)
    }

    fn history_with(slot_status: &str, fail_message: &str, storage: &str) -> History {
        let reply: HistoryReply = serde_json::from_value(json!({
            "history": {
                "slots": [{
                    "nzo_id": "nzo_a", "status": slot_status, "name": "A.Film",
                    "storage": storage, "fail_message": fail_message,
                    "bytes": 2048, "downloaded": 4096,
                }],
            }
        }))
        .unwrap();
        reply.history
    }

    #[test]
    fn a_downloading_slot_reports_progress_and_speed() {
        let job = from_queue(&queue("Downloading"), "nzo_a").unwrap();

        assert_eq!(job.state, JobState::Downloading);
        assert_eq!(job.progress, 0.75);
        assert_eq!(job.down_bps, 1_048_576);
        assert_eq!(job.size_bytes, 1_048_576_000);
        assert_eq!(job.save_path, None);
    }

    #[test]
    fn only_the_downloading_slot_takes_the_queue_speed() {
        for status in ["Queued", "Paused", "Propagating", "Grabbing", "Fetching"] {
            assert_eq!(from_queue(&queue(status), "nzo_a").unwrap().down_bps, 0, "{status}");
        }
    }

    #[test]
    fn queue_statuses_map_onto_the_callers_states() {
        let state = |s: &str| from_queue(&queue(s), "nzo_a").unwrap().state;

        assert_eq!(state("Paused"), JobState::Paused);
        assert_eq!(state("Queued"), JobState::Queued);
        assert_eq!(state("Propagating"), JobState::Queued);
        assert_eq!(state("Grabbing"), JobState::Queued);
        assert_eq!(state("Fetching"), JobState::Downloading);
    }

    #[test]
    fn a_slot_with_no_size_falls_back_to_its_percentage() {
        let reply: QueueReply = serde_json::from_value(json!({
            "queue": { "slots": [{ "nzo_id": "n", "status": "Grabbing", "percentage": "0" }] }
        }))
        .unwrap();

        assert_eq!(from_queue(&reply.queue, "n").unwrap().progress, 0.0);
    }

    #[test]
    fn another_jobs_slot_is_not_this_job() {
        assert_eq!(from_queue(&queue("Downloading"), "nzo_b"), None);
    }

    #[test]
    fn only_a_completed_history_slot_is_completed() {
        let job = from_history(&history("Completed", ""), "nzo_a").unwrap();

        assert_eq!(job.state, JobState::Completed);
        assert_eq!(job.progress, 1.0);
        assert_eq!(job.save_path.as_deref(), Some("/complete/A.Film"));
        assert_eq!(job.downloaded_bytes, 4096);
    }

    #[test]
    fn a_completed_slot_that_has_not_named_its_folder_yet_is_still_processing() {
        let job = from_history(&history_at("Completed", ""), "nzo_a").unwrap();

        assert_eq!(job.state, JobState::Processing);
        assert_eq!(job.save_path, None);
    }

    #[test]
    fn every_post_processing_stage_is_processing() {
        for status in [
            "Queued", "QuickCheck", "Verifying", "Repairing", "Extracting", "Moving", "Running",
            "Fetching",
        ] {
            let job = from_history(&history(status, ""), "nzo_a").unwrap();

            assert_eq!(job.state, JobState::Processing, "{status}");
            assert_eq!(job.progress, 1.0, "{status}");
            assert_eq!(job.save_path, None, "{status}");
        }
    }

    #[test]
    fn a_failed_slot_carries_its_message() {
        let job = from_history(&history("Failed", "Aborted, cannot be completed"), "nzo_a").unwrap();

        assert_eq!(job.state, JobState::Failed);
        assert_eq!(job.error.as_deref(), Some("Aborted, cannot be completed"));
        assert_eq!(job.save_path, None);
    }

    #[test]
    fn a_failed_slot_with_no_message_still_says_why() {
        let job = from_history(&history("Failed", ""), "nzo_a").unwrap();

        assert_eq!(job.error.as_deref(), Some("SABnzbd failed the job"));
    }
}
