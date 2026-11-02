//! What a module asks its host to do once, whatever number of instances it runs:
//! bring its own database to its last step, register its jobs and the event
//! topics it wants. The host reads it on [`LIFECYCLE_PATH`] from the first
//! instance, before that instance starts, and tells every instance its [`Role`]
//! in [`ROLE_ENV`]. A module that finds no role runs its whole startup itself,
//! which is what a host from before this expects, and a module that answers
//! without [`LIFECYCLE_HEADER`] was built before it.

use serde::{Deserialize, Serialize};

pub const LIFECYCLE_PATH: &str = "/_lifecycle";

pub const LIFECYCLE_HEADER: &str = "kroma-lifecycle";

pub const ROLE_ENV: &str = "KROMA_MODULE_ROLE";

/// What one instance of a module is for. A module has one primary at a time,
/// the only instance that runs `on_enable` and `on_disable`; a worker answers
/// calls.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Primary,
    Worker,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Primary => "primary",
            Self::Worker => "worker",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "primary" => Some(Self::Primary),
            "worker" => Some(Self::Worker),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lifecycle {
    #[serde(default)]
    pub migrations: Option<Migrations>,
    #[serde(default)]
    pub jobs: Vec<JobSpec>,
    #[serde(default)]
    pub events: Vec<String>,
}

/// A module's own schema: the baseline a new file is created from, and every
/// step since, oldest first.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Migrations {
    pub baseline: String,
    #[serde(default)]
    pub steps: Vec<MigrationStep>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationStep {
    pub name: String,
    pub sql: String,
    #[serde(default)]
    pub rebuilds: bool,
}

/// One job as the core scheduler registers it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSpec {
    pub key: String,
    pub category: String,
    #[serde(default)]
    pub schedule: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_role_reads_back_as_itself() {
        for role in [Role::Primary, Role::Worker] {
            assert_eq!(Role::parse(role.as_str()), Some(role));
        }
    }

    #[test]
    fn an_empty_answer_declares_nothing() {
        let lifecycle: Lifecycle = serde_json::from_str("{}").unwrap();

        assert_eq!(lifecycle, Lifecycle::default());
    }
}
