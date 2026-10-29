//! What a notification is about, and who caused it.

use serde::{Deserialize, Serialize};

/// What a notification is about. The core names `request`, `movie`, `show`,
/// `episode`, `report` and `job`; a module names its own as
/// `<module id>/<local name>`, so the vocabulary is open and a reader that does
/// not know a kind falls back to the row's `link`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSubject {
    pub kind: String,
    pub id: String,
}

impl NotificationSubject {
    pub fn new(kind: impl Into<String>, id: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            id: id.into(),
        }
    }

    pub fn request(id: impl Into<String>) -> Self {
        Self::new(SubjectKind::REQUEST, id)
    }

    pub fn movie(id: impl Into<String>) -> Self {
        Self::new(SubjectKind::MOVIE, id)
    }

    pub fn show(id: impl Into<String>) -> Self {
        Self::new(SubjectKind::SHOW, id)
    }

    pub fn episode(id: impl Into<String>) -> Self {
        Self::new(SubjectKind::EPISODE, id)
    }

    pub fn report(id: impl Into<String>) -> Self {
        Self::new(SubjectKind::REPORT, id)
    }

    pub fn job(key: impl Into<String>) -> Self {
        Self::new(SubjectKind::JOB, key)
    }
}

/// The kinds the core itself names. A module's kind is any other string.
pub struct SubjectKind;

impl SubjectKind {
    pub const REQUEST: &str = "request";
    pub const MOVIE: &str = "movie";
    pub const SHOW: &str = "show";
    pub const EPISODE: &str = "episode";
    pub const REPORT: &str = "report";
    pub const JOB: &str = "job";
}

/// Who a notification's reader sees as having caused it, resolved from
/// `actor_id` when the row is read so a renamed account shows its current name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationActor {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_subject_round_trips_as_a_kind_and_an_id() {
        let subject = NotificationSubject::request("d9661cad");

        let json = serde_json::to_string(&subject).unwrap();

        assert_eq!(json, r#"{"kind":"request","id":"d9661cad"}"#);
        assert_eq!(
            serde_json::from_str::<NotificationSubject>(&json).unwrap(),
            subject
        );
    }

    #[test]
    fn a_kind_a_module_invented_survives_the_round_trip() {
        let subject = NotificationSubject::new("tv.kroma.torrents/torrent", "abc");

        let back: NotificationSubject =
            serde_json::from_str(&serde_json::to_string(&subject).unwrap()).unwrap();

        assert_eq!(back.kind, "tv.kroma.torrents/torrent");
        assert_eq!(back.id, "abc");
    }

    #[test]
    fn an_actor_without_an_avatar_leaves_the_field_out() {
        let actor = NotificationActor {
            id: "u1".into(),
            name: "Ana".into(),
            avatar_url: None,
        };

        assert_eq!(
            serde_json::to_string(&actor).unwrap(),
            r#"{"id":"u1","name":"Ana"}"#
        );
    }
}
