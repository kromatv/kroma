//! Pipeline stage `subtitles`: pre-extract every embedded TEXT subtitle track to
//! its WebVTT cache, ONE ffmpeg pass per file, so the first time a viewer turns
//! subtitles on they load instantly (a disk read) instead of waiting on a
//! whole-file demux mid-playback. Wraps [`crate::infra::subtitles`]; the ledger
//! adds resumability, priority for fresh items, and per-item failure visibility.
//!
//! Image subs (PGS/VobSub) are skipped - they are bitmap and cannot become text,
//! so an item with only image subs is never enumerated (nothing to do).

use anyhow::{anyhow, Result};

use crate::infra::subtitles;
use crate::services::jobs::{JobContext, JobKey, Trigger};
use crate::state::SharedState;

use super::common::stage;

// One ffmpeg pass per item (all tracks muxed out together); the dispatcher pauses
// between items while anyone is streaming, as this reads whole files. Nightly, and
// chained after `storyboard` (rather than firing on the same library change), so
// the CPU-heavy stages run one after another instead of all at once. Also manual.
stage! {
    short: "subtitles",
    subject_kind: "item",
    concurrency: 2,
    pause_for_playback: true,
    schedule: Some("0 3 * * *"),
    triggers: &[Trigger::AfterJob(JobKey("pipeline.storyboard"))],
}

/// Every item with a backing file AND at least one text subtitle track, signed by
/// that file's `mtime:size` so a replaced file re-extracts. Items with no text subs
/// (none, or image-only) are not subjects. Fully-cached items still enumerate so
/// the ledger shows them `done`; `process` no-ops when nothing is pending.
fn enumerate(state: &SharedState) -> Result<Vec<(String, String)>> {
    let items = crate::db::list_items(&state.db, None)?;
    Ok(items
        .into_iter()
        .filter_map(|i| {
            let abs = i.abs_path.as_deref()?;
            if !i.subtitles.iter().any(|s| subtitles::is_text_codec(&s.codec)) {
                return None;
            }
            Some((i.id, super::sig_for_path(abs)))
        })
        .collect())
}

fn process(ctx: &JobContext, item_id: &str) -> Result<()> {
    let item = crate::db::get_item(&ctx.state.db, item_id)?
        .ok_or_else(|| anyhow!("item {item_id} no longer exists"))?;
    let Some(abs) = item.abs_path.as_deref() else {
        return Ok(()); // no backing file: nothing to extract
    };
    // All text tracks already cached (or none): a clean no-op cache hit. The
    // per-file lock dedupes against the on-demand endpoint and the playback
    // pre-warm. Threading the stage's cancellation kills the in-flight ffmpeg
    // pass at the next poll tick instead of running out the full timeout.
    let cancel = || ctx.cancelled();
    subtitles::extract_pending_locked(&ctx.state.config.data_dir, abs, &item.subtitles, &cancel)
        .map_err(|e| anyhow!(e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::jobs::JobContext;
    use crate::state::SharedState;
    use crate::test_support;

    /// Give `item_id`'s file the given subtitle track list (the JSON the probe
    /// stage writes).
    fn set_subs(state: &SharedState, item_id: &str, subs_json: &str) {
        let conn = state.db.get().unwrap();
        for table in ["items", "files"] {
            let key = if table == "items" { "id" } else { "item_id" };
            conn.execute(
                &format!("UPDATE {table} SET subtitles = '{subs_json}' WHERE {key} = '{item_id}'"),
                [],
            )
            .unwrap();
        }
    }

    fn subjects(state: &SharedState) -> Vec<String> {
        enumerate(state).unwrap().into_iter().map(|(id, _)| id).collect()
    }

    #[test]
    fn an_item_with_a_text_track_is_a_subject() {
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m1");
        set_subs(&state, "m1", r#"[{"codec":"subrip","language":"eng"}]"#);

        assert!(subjects(&state).contains(&"m1".to_string()));
    }

    #[test]
    fn an_item_with_no_subtitles_at_all_is_not_a_subject() {
        // Enumerating it would put a permanently no-op row in the ledger for
        // every subtitle-less file in the library.
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m2");

        assert!(!subjects(&state).contains(&"m2".to_string()));
    }

    #[test]
    fn an_item_with_only_image_subtitles_is_not_a_subject() {
        // PGS and VobSub are bitmaps. There is no ffmpeg pass that turns them
        // into WebVTT, so enumerating them would queue work that can only fail.
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m3");
        set_subs(&state, "m3", r#"[{"codec":"hdmv_pgs_subtitle"},{"codec":"dvd_subtitle"}]"#);

        assert!(!subjects(&state).contains(&"m3".to_string()));
    }

    #[test]
    fn one_text_track_among_image_ones_is_enough() {
        // A disc rip usually carries PGS plus an SRT. The SRT is extractable and
        // is exactly what the viewer wants loaded instantly.
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m4");
        set_subs(&state, "m4", r#"[{"codec":"hdmv_pgs_subtitle"},{"codec":"ass"}]"#);

        assert!(subjects(&state).contains(&"m4".to_string()));
    }

    #[test]
    fn an_item_whose_file_is_gone_is_not_a_subject_even_with_text_tracks() {
        // The probe left subtitle tracks on the row, then the file was removed.
        // There is nothing to demux; enumerating it would queue a task whose
        // only possible outcome is a failure row in the ledger.
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m7");
        set_subs(&state, "m7", r#"[{"codec":"subrip"}]"#);
        state
            .db
            .get()
            .unwrap()
            .execute("UPDATE items SET abs_path = NULL WHERE id = 'm7'", [])
            .unwrap();
        state.db.get().unwrap().execute("DELETE FROM files WHERE item_id = 'm7'", []).unwrap();

        assert!(!subjects(&state).contains(&"m7".to_string()));
    }

    #[test]
    fn a_subject_is_signed_by_its_file_so_a_replacement_re_extracts() {
        // The cache is keyed on the file's bytes. A signature that ignored them
        // would leave the old episode's subtitles on the replaced file forever.
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m5");
        set_subs(&state, "m5", r#"[{"codec":"subrip"}]"#);

        let sig = enumerate(&state)
            .unwrap()
            .into_iter()
            .find(|(id, _)| id == "m5")
            .map(|(_, sig)| sig)
            .expect("m5 is a subject");
        // The seeded path does not exist on disk, so it signs as unreadable
        // rather than as a fabricated `0:0` that a real empty file would share.
        assert_eq!(sig, crate::db::pipeline::UNREADABLE_SIG);
    }

    #[test]
    fn an_item_deleted_mid_pass_fails_by_name_rather_than_silently() {
        // The stage enumerates once and works the list; naming the item is what
        // makes the ledger row explain itself in the admin UI.
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state);
        let err = process(&ctx, "ghost").unwrap_err().to_string();
        assert!(err.contains("ghost"), "{err}");
    }

    #[test]
    fn an_item_with_no_backing_file_is_a_no_op() {
        // A row can exist with its file gone (a pending re-scan). There is
        // nothing to demux, and failing would mark the whole item broken.
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m6");
        state
            .db
            .get()
            .unwrap()
            .execute("UPDATE items SET abs_path = NULL WHERE id = 'm6'", [])
            .unwrap();
        state.db.get().unwrap().execute("DELETE FROM files WHERE item_id = 'm6'", []).unwrap();

        let ctx = JobContext::for_test(state);
        assert!(process(&ctx, "m6").is_ok());
    }
}
