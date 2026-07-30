//! Pipeline stage `markers`: detects intro/credits per **season**, since
//! chromaprint aligns a season's episodes pairwise. Wraps
//! [`crate::services::markers::job::detect_season`].

use anyhow::{anyhow, Result};

use crate::services::jobs::{JobContext, JobKey, Trigger};
use crate::state::SharedState;

use super::common::stage;

// `detect_season` parallelizes the episode decode internally and yields to
// playback there, so the dispatcher does not. Chained after `subtitles` so the
// heavy stages run one at a time rather than all firing on one library change.
stage! {
    short: "markers",
    subject_kind: "season",
    concurrency: 1,
    pause_for_playback: false,
    schedule: Some("30 3 * * *"),
    triggers: &[Trigger::AfterJob(JobKey("pipeline.subtitles"))],
}

// With detection off nothing is in scope, which is how the ledger purges the
// existing tasks.
fn enumerate(state: &SharedState) -> Result<Vec<(String, String)>> {
    let mode = state.settings.get_str("introDetection", "chapters");
    if mode == "off" {
        return Ok(Vec::new());
    }
    let shows = crate::db::list_shows(&state.db, None)?;
    let mut out = Vec::new();
    for show in &shows {
        let Some(detail) = crate::db::get_show(&state.db, &show.id)? else {
            continue;
        };
        for season in &detail.seasons {
            if let Some(sig) = season_signature(&mode, season) {
                out.push((format!("{}#{}", show.id, season.number), sig));
            }
        }
    }
    Ok(out)
}

// One unreadable episode (a mount blip) collapses the whole season to
// `UNREADABLE_SIG`, so `reconcile` skips it instead of re-fingerprinting on
// every flap.
fn season_signature(mode: &str, season: &crate::model::Season) -> Option<String> {
    let mut parts = vec![mode.to_string()];
    let mut playable = 0usize;
    let mut unreadable = false;
    for ep in &season.episodes {
        if let (Some(abs), Some(d)) = (ep.abs_path.as_deref(), ep.duration_ms) {
            if d > 0 {
                playable += 1;
                let sig = super::sig_for_path(abs);
                unreadable |= sig == crate::db::pipeline::UNREADABLE_SIG;
                parts.push(sig);
            }
        }
    }
    if playable == 0 {
        return None;
    }
    if unreadable {
        Some(crate::db::pipeline::UNREADABLE_SIG.to_string())
    } else {
        Some(crate::services::scan::short_hash(&parts.join("|")))
    }
}

fn process(ctx: &JobContext, subject_id: &str) -> Result<()> {
    let (show_id, season_num) = subject_id
        .rsplit_once('#')
        .ok_or_else(|| anyhow!("malformed season subject id {subject_id}"))?;
    let season_num: u32 = season_num
        .parse()
        .map_err(|_| anyhow!("malformed season number in {subject_id}"))?;
    let detail = crate::db::get_show(&ctx.state.db, show_id)?
        .ok_or_else(|| anyhow!("show {show_id} no longer exists"))?;
    let season = detail
        .seasons
        .iter()
        .find(|s| s.number == season_num)
        .ok_or_else(|| anyhow!("season {season_num} of {show_id} no longer exists"))?;
    crate::services::markers::job::detect_season(ctx, season)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::season_signature;
    use crate::model::{Kind, MediaItem, Season};

    fn episode(abs_path: Option<&str>, duration_ms: Option<u64>) -> MediaItem {
        MediaItem {
            id: "e".into(),
            title: "E".into(),
            kind: Kind::Episode,
            year: None,
            duration_ms,
            container: "mkv".into(),
            video: None,
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            library: "lib1".into(),
            show_id: Some("s1".into()),
            show_title: Some("Show".into()),
            season: Some(1),
            episode: Some(1),
            episode_end: None,
            episode_title: None,
            rel_path: None,
            added_at: "now".into(),
            metadata: None,
            abs_path: abs_path.map(str::to_string),
            files: Vec::new(),
            default_file_id: None,
            markers: Vec::new(),
            audio_analysis: None,
        }
    }

    fn season(episodes: Vec<MediaItem>) -> Season {
        Season { number: 1, episodes, cast: Vec::new() }
    }

    #[test]
    fn season_signature_none_without_probed_episodes() {
        assert_eq!(season_signature("chapters", &season(vec![episode(None, Some(1000))])), None);
        assert_eq!(
            season_signature("chapters", &season(vec![episode(Some("/x.mkv"), None)])),
            None
        );
        assert_eq!(
            season_signature("chapters", &season(vec![episode(Some("/x.mkv"), Some(0))])),
            None
        );
        assert_eq!(season_signature("chapters", &season(vec![])), None);
    }

    #[test]
    fn season_signature_unreadable_file_collapses_to_sentinel() {
        let sig = season_signature(
            "chapters",
            &season(vec![episode(Some("/no/such/kroma/file.mkv"), Some(1000))]),
        );
        assert_eq!(sig.as_deref(), Some(crate::db::pipeline::UNREADABLE_SIG));
    }

    #[test]
    fn season_signature_hashes_readable_files_and_depends_on_mode() {
        use std::sync::atomic::{AtomicU32, Ordering};
        static SEQ: AtomicU32 = AtomicU32::new(0);
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("kroma-seasonsig-{}-{n}.mkv", std::process::id()));
        std::fs::write(&path, b"hello").unwrap();
        let abs = path.to_string_lossy().to_string();

        let s = season(vec![episode(Some(&abs), Some(1000))]);
        let a = season_signature("chapters", &s).unwrap();
        assert_ne!(a, crate::db::pipeline::UNREADABLE_SIG);
        assert_eq!(a, season_signature("chapters", &s).unwrap());
        assert_ne!(a, season_signature("silence", &s).unwrap());

        let _ = std::fs::remove_file(&path);
    }

    use super::{enumerate, process};
    use crate::services::jobs::JobContext;
    use crate::state::SharedState;
    use crate::test_support::{seed_show_episode, test_state};

    fn seed_probed_season(state: &SharedState, show: &str, ep: &str) {
        seed_probed_season_with(state, show, ep, true);
    }

    fn seed_probed_season_with(state: &SharedState, show: &str, ep: &str, on_disk: bool) {
        // Unique per CALL, not per episode id: several tests use "ep-1" and run
        // in parallel, so a shared path races file creation against removal.
        static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        seed_show_episode(state, show, ep);
        let path =
            std::env::temp_dir().join(format!("kroma-marker-{}-{n}-{ep}.mkv", std::process::id()));
        if on_disk {
            std::fs::write(&path, b"not really a video").unwrap();
        } else {
            let _ = std::fs::remove_file(&path);
        }
        state
            .db
            .get()
            .unwrap()
            .execute_batch(&format!(
                "UPDATE items SET duration_ms = 1200000, abs_path = '{p}' WHERE id = '{ep}'; \
                 UPDATE files SET abs_path = '{p}' WHERE item_id = '{ep}';",
                p = path.to_string_lossy()
            ))
            .unwrap();
    }

    #[test]
    fn one_unreadable_episode_collapses_the_whole_season() {
        let state = test_state();
        seed_probed_season_with(&state, "shw-1", "ep-1", false);
        set_mode(&state, "chapters");

        let subjects = enumerate(&state).unwrap();
        assert_eq!(subjects.len(), 1);
        assert_eq!(subjects[0].1, crate::db::pipeline::UNREADABLE_SIG);
    }

    fn set_mode(state: &SharedState, mode: &str) {
        use kroma_module_host::HostCtx as _;
        state.set_settings(std::collections::BTreeMap::from([(
            "introDetection".to_string(),
            serde_json::json!(mode),
        )]));
    }

    #[test]
    fn detection_turned_off_puts_nothing_in_scope() {
        let state = test_state();
        seed_probed_season(&state, "shw-1", "ep-1");
        set_mode(&state, "off");
        assert!(enumerate(&state).unwrap().is_empty());
    }

    #[test]
    fn a_season_is_one_subject_named_show_then_season() {
        let state = test_state();
        seed_probed_season(&state, "shw-1", "ep-1");
        set_mode(&state, "chapters");

        let subjects = enumerate(&state).unwrap();
        assert_eq!(subjects.len(), 1, "one subject per SEASON, not per episode");
        assert_eq!(subjects[0].0, "shw-1#1");
    }

    #[test]
    fn a_season_with_nothing_probed_yet_waits_rather_than_queuing() {
        let state = test_state();
        seed_show_episode(&state, "shw-1", "ep-1"); // no duration_ms
        set_mode(&state, "chapters");
        assert!(enumerate(&state).unwrap().is_empty());
    }

    #[test]
    fn changing_the_detection_mode_re_queues_the_season() {
        let state = test_state();
        seed_probed_season(&state, "shw-1", "ep-1");

        set_mode(&state, "chapters");
        let chapters = enumerate(&state).unwrap();
        set_mode(&state, "fingerprint");
        let fingerprint = enumerate(&state).unwrap();

        assert_eq!(chapters[0].0, fingerprint[0].0, "same subject");
        assert_ne!(chapters[0].1, fingerprint[0].1, "different signature");
    }

    #[test]
    fn a_subject_id_that_is_not_a_season_is_named_in_the_error() {
        let state = test_state();
        let ctx = JobContext::for_test(state);
        let err = process(&ctx, "no-hash-here").unwrap_err().to_string();
        assert!(err.contains("no-hash-here"), "{err}");

        let err = process(&ctx, "shw-1#notanumber").unwrap_err().to_string();
        assert!(err.contains("shw-1#notanumber"), "{err}");
    }

    #[test]
    fn a_season_deleted_since_it_was_queued_errors_rather_than_panicking() {
        let state = test_state();
        let ctx = JobContext::for_test(state.clone());
        let err = process(&ctx, "gone-show#1").unwrap_err().to_string();
        assert!(err.contains("gone-show"), "{err}");

        seed_probed_season(&state, "shw-1", "ep-1");
        let ctx = JobContext::for_test(state);
        let err = process(&ctx, "shw-1#99").unwrap_err().to_string();
        assert!(err.contains("99"), "{err}");
    }
}
