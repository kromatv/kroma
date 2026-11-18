//! One import of another media server's household: what the owner kept on the
//! review screen, how the run stands and the report it ends with. These are the
//! wire types of `/api/admin/imports`. A time is epoch milliseconds.

use serde::{Deserialize, Serialize};

/// What the owner kept on the review screen. A library or a user it does not
/// name is left out of the import.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Selection {
    pub libraries: Vec<KeptLibrary>,
    pub users: Vec<KeptUser>,
}

/// One library the owner kept, by the other server's id for it. `folders` are
/// the folders of that library the owner confirmed. A source is made over no
/// other.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeptLibrary {
    pub id: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub folders: Vec<KeptFolder>,
}

/// Where one folder of the other server is on this machine: `folder` as that
/// server names it, `here` as this machine does. The two are equal for a
/// folder that has the same name on both.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeptFolder {
    pub folder: String,
    pub here: String,
}

/// One user the owner kept, by the other server's id for them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeptUser {
    pub id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Queued,
    Running,
    Completed,
    Cancelled,
    Failed,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
            Self::Failed => "failed",
        }
    }
}

impl std::str::FromStr for Status {
    type Err = ();

    fn from_str(stored: &str) -> Result<Self, Self::Err> {
        [
            Self::Queued,
            Self::Running,
            Self::Completed,
            Self::Cancelled,
            Self::Failed,
        ]
        .into_iter()
        .find(|status| status.as_str() == stored)
        .ok_or(())
    }
}

/// The kinds of row an import reads from the other server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Kind {
    Library,
    User,
    Title,
    State,
    Play,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Library => "library",
            Self::User => "user",
            Self::Title => "title",
            Self::State => "state",
            Self::Play => "play",
        }
    }
}

/// Rows of one kind: how many the other server gave, how many of them changed
/// something here, and how many matched nothing here.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Tally {
    pub read: u64,
    pub brought: u64,
    pub unmatched: u64,
}

/// What one import did, kind by kind. A row that is read and neither brought
/// nor unmatched was here already.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Report {
    pub libraries: Tally,
    pub users: Tally,
    pub titles: Tally,
    pub states: Tally,
    pub plays: Tally,
}

impl Report {
    pub fn tally_mut(&mut self, kind: Kind) -> &mut Tally {
        match kind {
            Kind::Library => &mut self.libraries,
            Kind::User => &mut self.users,
            Kind::Title => &mut self.titles,
            Kind::State => &mut self.states,
            Kind::Play => &mut self.plays,
        }
    }
}

/// Why an import ended before its end. A reason this build does not know reads
/// as `Internal`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FailureReason {
    ImporterAbsent,
    ImporterFailed,
    ImporterUnreadable,
    RepeatedCursor,
    Interrupted,
    #[default]
    #[serde(other)]
    Internal,
}

/// `message` is the importer's own words when it said why it failed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    #[serde(default)]
    pub reason: FailureReason,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// The other server an import read, as the importer names it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Origin {
    pub id: String,
    #[serde(default)]
    pub name: String,
}

/// One import. `sign_in` is the reference the importer gave for the sign-in it
/// keeps, absent once the owner had it forgotten. `unmatched_titles` counts the
/// titles of `GET /api/admin/imports/:id/unmatched`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Import {
    pub id: String,
    pub importer: String,
    pub server: Origin,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sign_in: Option<String>,
    pub selection: Selection,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_by: Option<String>,
    pub status: Status,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<i64>,
    pub report: Report,
    pub unmatched_titles: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure: Option<Failure>,
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use serde_json::json;

    use super::*;

    #[test]
    fn a_status_parses_back_from_the_name_it_is_stored_as() {
        let statuses = [
            Status::Queued,
            Status::Running,
            Status::Completed,
            Status::Cancelled,
            Status::Failed,
        ];

        let parsed: Vec<Status> = statuses
            .iter()
            .map(|status| Status::from_str(status.as_str()).unwrap())
            .collect();

        assert_eq!(parsed, statuses);
        assert_eq!(Status::from_str("paused"), Err(()));
    }

    #[test]
    fn a_selection_names_what_the_owner_kept_and_an_absent_list_keeps_nothing() {
        let selection: Selection =
            serde_json::from_value(json!({ "libraries": [{ "id": "1" }] })).unwrap();

        assert_eq!(
            selection,
            Selection {
                libraries: vec![KeptLibrary {
                    id: "1".into(),
                    folders: Vec::new(),
                }],
                users: Vec::new(),
            }
        );
    }

    #[test]
    fn a_kept_library_carries_where_the_owner_said_each_of_its_folders_is() {
        let kept: KeptLibrary = serde_json::from_value(json!({
            "id": "1",
            "folders": [{ "folder": "/data/movies", "here": "/volume1/video/movies" }],
        }))
        .unwrap();

        assert_eq!(
            kept.folders,
            vec![KeptFolder {
                folder: "/data/movies".into(),
                here: "/volume1/video/movies".into(),
            }]
        );
        assert_eq!(
            serde_json::to_value(KeptLibrary {
                id: "1".into(),
                folders: Vec::new(),
            })
            .unwrap(),
            json!({ "id": "1" })
        );
    }

    #[test]
    fn a_report_counts_each_kind_on_its_own_tally() {
        let mut report = Report::default();

        report.tally_mut(Kind::State).brought += 2;
        report.tally_mut(Kind::Play).unmatched += 1;

        assert_eq!(
            serde_json::to_value(report).unwrap(),
            json!({
                "libraries": { "read": 0, "brought": 0, "unmatched": 0 },
                "users": { "read": 0, "brought": 0, "unmatched": 0 },
                "titles": { "read": 0, "brought": 0, "unmatched": 0 },
                "states": { "read": 0, "brought": 2, "unmatched": 0 },
                "plays": { "read": 0, "brought": 0, "unmatched": 1 },
            })
        );
    }

    #[test]
    fn a_failure_reason_this_build_does_not_know_reads_as_internal() {
        let failure: Failure = serde_json::from_value(json!({ "reason": "outOfDisk" })).unwrap();

        assert_eq!(failure.reason, FailureReason::Internal);
    }
}
