//! The facts each core event records on its row, beside the subject.
//!
//! The row's `event` column is the discriminant, so each of these serialises as
//! a plain object. `@kromatv/client/notifications` holds the matching zod
//! schema, keyed by the same event name.

use serde::{Deserialize, Serialize};

use crate::reports::{ReportStatus, ReportSubjectKind};
use crate::requests::{RequestKind, RequestStatus};

/// `request.submitted` · `request.approved` · `request.denied` ·
/// `request.available`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestEventData {
    pub request_id: String,
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub status: RequestStatus,
}

/// `media.added`. `item_id` is set only when the run announced a single title.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAddedData {
    pub count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item_id: Option<String>,
}

/// `media.episode`. `season` and `episode` are set only when the run announced a
/// single episode.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaEpisodeData {
    pub show_id: String,
    pub count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub season: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode: Option<u32>,
}

/// `report.submitted` · `report.resolved` · `report.dismissed`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportEventData {
    pub report_id: String,
    pub subject_kind: ReportSubjectKind,
    pub subject_id: String,
    pub status: ReportStatus,
}

/// `system.job.failed`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobFailedData {
    pub job: String,
    pub run_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_requests_facts_spell_their_fields_the_way_the_client_reads_them() {
        let data = RequestEventData {
            request_id: "r1".into(),
            kind: RequestKind::Show,
            tmdb_id: 1399,
            status: RequestStatus::PartiallyAvailable,
        };

        let json = serde_json::to_string(&data).unwrap();

        assert_eq!(
            json,
            r#"{"requestId":"r1","kind":"show","tmdbId":1399,"status":"partially_available"}"#
        );
    }

    #[test]
    fn a_digest_batch_names_no_single_title() {
        let data = MediaAddedData {
            count: 12,
            item_id: None,
        };

        assert_eq!(serde_json::to_string(&data).unwrap(), r#"{"count":12}"#);
    }

    #[test]
    fn a_single_episode_carries_its_numbers_and_a_season_drop_does_not() {
        let one = MediaEpisodeData {
            show_id: "shw".into(),
            count: 1,
            season: Some(1),
            episode: Some(4),
        };
        let many = MediaEpisodeData {
            show_id: "shw".into(),
            count: 4,
            season: None,
            episode: None,
        };

        assert_eq!(
            serde_json::to_string(&one).unwrap(),
            r#"{"showId":"shw","count":1,"season":1,"episode":4}"#
        );
        assert_eq!(
            serde_json::to_string(&many).unwrap(),
            r#"{"showId":"shw","count":4}"#
        );
    }

    #[test]
    fn a_reports_facts_round_trip() {
        let data = ReportEventData {
            report_id: "rep1".into(),
            subject_kind: ReportSubjectKind::Episode,
            subject_id: "ep1".into(),
            status: ReportStatus::Dismissed,
        };

        let back: ReportEventData =
            serde_json::from_str(&serde_json::to_string(&data).unwrap()).unwrap();

        assert_eq!(back, data);
    }

    #[test]
    fn a_failed_job_names_the_run_that_failed() {
        let data = JobFailedData {
            job: "library.scan".into(),
            run_id: "run-7".into(),
        };

        assert_eq!(
            serde_json::to_string(&data).unwrap(),
            r#"{"job":"library.scan","runId":"run-7"}"#
        );
    }
}
