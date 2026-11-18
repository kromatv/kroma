//! Why an import stopped before its end.

use std::fmt;

use crate::model::imports::{Failure, FailureReason};
use crate::services::importers::Unanswered;

/// `Cancelled` is the owner's doing and no failure. `Internal` is this server's
/// own: its database or one of its stages.
#[derive(Debug)]
pub(crate) enum Halt {
    Cancelled,
    Importer(Unanswered),
    RepeatedCursor,
    Internal(anyhow::Error),
}

impl Halt {
    /// What the import's row keeps of it. `None` for a cancel.
    pub(super) fn failure(&self) -> Option<Failure> {
        let (reason, message) = match self {
            Self::Cancelled => return None,
            Self::Importer(Unanswered::Absent) => (FailureReason::ImporterAbsent, None),
            Self::Importer(Unanswered::Failed(said)) => {
                (FailureReason::ImporterFailed, Some(said.clone()))
            }
            Self::Importer(Unanswered::Unreadable(_)) => (FailureReason::ImporterUnreadable, None),
            Self::RepeatedCursor => (FailureReason::RepeatedCursor, None),
            Self::Internal(_) => (FailureReason::Internal, None),
        };
        Some(Failure { reason, message })
    }
}

impl fmt::Display for Halt {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Cancelled => f.write_str("the import was cancelled"),
            Self::Importer(Unanswered::Absent) => f.write_str("the importer is not running"),
            Self::Importer(Unanswered::Failed(said)) => write!(f, "the importer failed: {said}"),
            Self::Importer(Unanswered::Unreadable(_)) => {
                f.write_str("the importer gave an answer this server cannot read")
            }
            Self::RepeatedCursor => f.write_str("the importer gave the same cursor twice"),
            Self::Internal(error) => write!(f, "{error:#}"),
        }
    }
}

impl From<anyhow::Error> for Halt {
    fn from(error: anyhow::Error) -> Self {
        Self::Internal(error)
    }
}

impl From<Unanswered> for Halt {
    fn from(why: Unanswered) -> Self {
        Self::Importer(why)
    }
}
