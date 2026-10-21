use std::collections::HashMap;

use crate::model::Treatment;

pub(super) type Ledger = HashMap<String, (String, Option<String>)>;

pub(super) fn tr(key: &str, status: &str, error: Option<String>) -> Treatment {
    Treatment {
        key: key.to_string(),
        status: status.to_string(),
        error,
    }
}

/// The single source of truth for a (subject, stage) status, shared with the
/// per-element drawer so the two never disagree: a present ledger state always
/// wins; with no ledger row, `artifact_done`/`assume_done` decide done vs pending.
pub fn resolve_status(
    ledger_status: Option<&str>,
    artifact_done: bool,
    assume_done: bool,
) -> &'static str {
    match ledger_status {
        Some("failed") => "failed",
        Some("running") => "running",
        Some("pending") => "pending",
        Some(_) => "done",
        None if artifact_done || assume_done => "done",
        None => "pending",
    }
}

pub(super) fn status_of(
    ledger: Option<&(String, Option<String>)>,
    artifact_done: bool,
    assume_done: bool,
) -> (&'static str, Option<String>) {
    let status = resolve_status(ledger.map(|(s, _)| s.as_str()), artifact_done, assume_done);
    let err = if status == "failed" {
        ledger.and_then(|(_, e)| e.clone())
    } else {
        None
    };
    (status, err)
}

pub(super) fn overall_of(treatments: &[Treatment]) -> &'static str {
    let mut fail = false;
    let mut run = false;
    let mut pend = false;
    for t in treatments {
        match t.status.as_str() {
            "failed" => fail = true,
            "running" => run = true,
            "pending" | "missing" => pend = true,
            _ => {}
        }
    }
    if fail {
        "failed"
    } else if run {
        "running"
    } else if pend {
        "pending"
    } else {
        "ok"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_status_ledger_wins_then_artifacts() {
        assert_eq!(resolve_status(Some("failed"), true, true), "failed");
        assert_eq!(resolve_status(Some("running"), false, false), "running");
        assert_eq!(resolve_status(Some("pending"), true, false), "pending");
        assert_eq!(resolve_status(Some("done"), false, false), "done");
        assert_eq!(resolve_status(None, true, false), "done");
        assert_eq!(resolve_status(None, false, true), "done");
        assert_eq!(resolve_status(None, false, false), "pending");
    }

    #[test]
    fn status_of_surfaces_error_only_when_failed() {
        let failed = ("failed".to_string(), Some("boom".to_string()));
        assert_eq!(
            status_of(Some(&failed), false, false),
            ("failed", Some("boom".to_string()))
        );
        let running = ("running".to_string(), Some("stale".to_string()));
        assert_eq!(status_of(Some(&running), false, false), ("running", None));
        assert_eq!(status_of(None, true, false), ("done", None));
    }

    #[test]
    fn overall_of_precedence_failed_running_pending_ok() {
        let mk = |s: &str| tr("x", s, None);
        assert_eq!(overall_of(&[mk("done"), mk("done")]), "ok");
        assert_eq!(overall_of(&[mk("done"), mk("pending")]), "pending");
        assert_eq!(overall_of(&[mk("missing"), mk("done")]), "pending");
        assert_eq!(overall_of(&[mk("pending"), mk("running")]), "running");
        assert_eq!(overall_of(&[mk("running"), mk("failed")]), "failed");
        assert_eq!(overall_of(&[]), "ok");
    }
}
