//! Credits detection for ONE film, the unit of work of the pipeline `credits`
//! stage. Two sources: the file's chapters (the studio's own cut, when it has
//! one at the credits) and, when the `introDetection` setting allows the heavy
//! pass, the picture itself. Chapters win when the two agree; the picture wins
//! when they do not, because it is direct evidence and a distant chapter mark is
//! usually the last scene.

use std::path::Path;

use anyhow::Result;

use super::video;
use crate::db;
use crate::infra::probe::{credits_from_last_chapter, markers_from_chapters, probe_file};
use crate::model::{MarkerKind, MediaItem};
use crate::services::jobs::JobContext;

const AGREE_MS: u64 = 90_000;

/// Detect where `item`'s credits start and write the marker. Reads the
/// `introDetection` setting on each call: `off` does nothing, `chapters` reads
/// the chapter cut only, `fingerprint` adds the picture scan. Returns whether a
/// marker was written.
pub fn detect_movie(ctx: &JobContext, item: &MediaItem) -> Result<bool> {
    let mode = ctx.state.settings.get_str("introDetection", "chapters");
    if mode == "off" {
        return Ok(false);
    }
    let (Some(path), Some(duration_ms)) = (
        item.abs_path.as_deref(),
        item.duration_ms.filter(|d| *d > 0),
    ) else {
        return Ok(false);
    };
    let path = Path::new(path);
    let probe = probe_file(path, ctx.state.ffprobe_available);
    let duration_ms = probe.duration_ms.filter(|d| *d > 0).unwrap_or(duration_ms);
    let chapter = markers_from_chapters(&probe.chapters, Some(duration_ms))
        .into_iter()
        .find(|(kind, _, _)| *kind == MarkerKind::Credits)
        .map(|(_, start, end)| (start, end))
        .or_else(|| credits_from_last_chapter(&probe.chapters, duration_ms));
    let picture = if mode == "fingerprint" && !ctx.cancelled() {
        match video::credits_start_ms(path, duration_ms) {
            Ok(start) => start.map(|s| (s, duration_ms)),
            Err(e) => {
                ctx.warn(format!("  {}: picture scan failed: {e:#}", item.title));
                None
            }
        }
    } else {
        None
    };
    let Some((start, end, source)) = reconcile(chapter, picture) else {
        return Ok(false);
    };
    ctx.info(format!(
        "  + credits {} {}-{} ({source})",
        item.title,
        fmt_ms(start),
        fmt_ms(end)
    ));
    db::set_marker(
        &ctx.state.db,
        &item.id,
        MarkerKind::Credits,
        start,
        end,
        source,
    )?;
    Ok(true)
}

/// Pure: which source's range to keep, and under which name.
pub fn reconcile(
    chapter: Option<(u64, u64)>,
    picture: Option<(u64, u64)>,
) -> Option<(u64, u64, &'static str)> {
    match (chapter, picture) {
        (Some(c), Some(p)) if c.0.abs_diff(p.0) <= AGREE_MS => Some((c.0, c.1, "chapters")),
        (_, Some(p)) => Some((p.0, p.1, "video")),
        (Some(c), None) => Some((c.0, c.1, "chapters")),
        (None, None) => None,
    }
}

fn fmt_ms(ms: u64) -> String {
    let secs = ms / 1000;
    format!("{}:{:02}", secs / 60, secs % 60)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{seed_movie, test_state};

    #[test]
    fn a_chapter_cut_near_the_picture_wins_as_the_authored_source() {
        assert_eq!(
            reconcile(Some((6_000_000, 7_200_000)), Some((6_030_000, 7_200_000))),
            Some((6_000_000, 7_200_000, "chapters"))
        );
    }

    #[test]
    fn the_picture_wins_over_a_chapter_cut_that_sits_elsewhere() {
        assert_eq!(
            reconcile(Some((5_400_000, 7_200_000)), Some((6_030_000, 7_200_000))),
            Some((6_030_000, 7_200_000, "video"))
        );
    }

    #[test]
    fn one_source_alone_is_kept_and_none_yields_nothing() {
        assert_eq!(
            reconcile(Some((6_000_000, 7_200_000)), None),
            Some((6_000_000, 7_200_000, "chapters"))
        );
        assert_eq!(
            reconcile(None, Some((6_000_000, 7_200_000))),
            Some((6_000_000, 7_200_000, "video"))
        );
        assert_eq!(reconcile(None, None), None);
    }

    #[test]
    fn detection_off_writes_nothing_and_an_unprobed_film_waits() {
        let state = test_state();
        seed_movie(&state, "m1");
        let item = crate::db::get_item(&state.db, "m1").unwrap().unwrap();
        state.settings.set_patch(
            &state.db,
            [("introDetection".to_string(), serde_json::json!("off"))].into(),
        );
        let ctx = JobContext::for_test(state);

        assert!(!detect_movie(&ctx, &item).unwrap());

        ctx.state.settings.set_patch(
            &ctx.state.db,
            [("introDetection".to_string(), serde_json::json!("chapters"))].into(),
        );
        assert!(!detect_movie(&ctx, &item).unwrap());
    }
}
