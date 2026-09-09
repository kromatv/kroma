//! Which of an item's files represents it, and the top-level fields that
//! mirror it for clients reading `item.video.codec` directly.

use kroma_domain::{MediaFile, MediaItem};

// Rank and group the files, then mirror the representative one into the item's
// top-level fields (the shared tail of [`attach_files`] / [`attach_files_batch`]).
pub(super) fn apply_files(item: &mut MediaItem, files: Vec<MediaFile>) {
    let files = super::editions::apply_editions(item, files);
    // Representative = the first probed file that opened, else the first file.
    let rep = files
        .iter()
        .find(|f| f.probed && f.unreadable.is_none())
        .or_else(|| files.first());
    if let Some(rep) = rep {
        item.default_file_id = Some(rep.id.clone());
        // Demo files carry a synthetic `demo://` path and aren't streamable; keep
        // `abs_path` None for them so `/stream` returns the demo error.
        item.abs_path = rep.abs_path.clone().filter(|p| !p.starts_with("demo://"));
        if rep.probed {
            item.container = rep.container.clone();
            item.duration_ms = rep.duration_ms;
            item.video = rep.video.clone();
            item.audio = rep.audio.clone();
            item.audio_tracks = rep.audio_tracks.clone();
            item.subtitles = rep.subtitles.clone();
            item.rel_path = rep.rel_path.clone();
        } else {
            // Unprobed: keep streams null but expose container/rel for browsing.
            item.container = rep.container.clone();
            item.rel_path = rep.rel_path.clone();
        }
    }
    item.files = files;
}

#[cfg(test)]
mod apply_files_tests {
    use super::*;
    use kroma_domain::{Kind, VideoStream};

    fn video() -> VideoStream {
        VideoStream {
            codec: "hevc".into(),
            width: Some(3840),
            height: Some(2160),
            hdr: false,
            bit_depth: Some(10),
            hdr_format: None,
            dolby_vision_profile: None,
            color: None,
        }
    }

    fn file(id: &str, abs: &str, probed: bool) -> MediaFile {
        MediaFile {
            id: id.into(),
            rel_path: Some(format!("{id}.mkv")),
            container: "mkv".into(),
            duration_ms: if probed { Some(7_200_000) } else { None },
            video: if probed { Some(video()) } else { None },
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            size: Some(1000),
            edition: None,
            probed,
            unreadable: None,
            edition_id: None,
            abs_path: Some(abs.into()),
        }
    }

    // An item as it comes off the row, before its files are applied.
    fn bare_item() -> MediaItem {
        MediaItem {
            id: "itm".into(),
            title: "T".into(),
            kind: Kind::Movie,
            year: None,
            duration_ms: None,
            container: String::new(),
            video: None,
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            library: "lib".into(),
            show_id: None,
            show_title: None,
            season: None,
            episode: None,
            episode_end: None,
            episode_title: None,
            rel_path: None,
            added_at: "t".into(),
            metadata: None,
            abs_path: None,
            files: Vec::new(),
            editions: Vec::new(),
            default_file_id: None,
            markers: Vec::new(),
            audio_analysis: None,
        }
    }

    #[test]
    fn an_item_with_no_files_is_left_alone() {
        let mut item = bare_item();
        apply_files(&mut item, Vec::new());
        // Nothing to represent it, so no default file and nothing streamable.
        assert!(item.default_file_id.is_none());
        assert!(item.abs_path.is_none());
        assert!(item.files.is_empty());
    }

    #[test]
    fn the_representative_is_the_first_probed_file() {
        let mut item = bare_item();
        // Files arrive probed-first, highest-res-first - but an unprobed one can
        // still lead if it was added later, so the choice is explicit.
        apply_files(
            &mut item,
            vec![file("b", "/m/b.mkv", false), file("a", "/m/a.mkv", true)],
        );

        assert_eq!(item.default_file_id.as_deref(), Some("a"));
        // A probed rep publishes the stream fields clients read directly.
        assert_eq!(item.duration_ms, Some(7_200_000));
        assert!(item.video.is_some());
    }

    #[test]
    fn falls_back_to_the_first_file_when_none_is_probed() {
        let mut item = bare_item();
        apply_files(
            &mut item,
            vec![file("a", "/m/a.mkv", false), file("b", "/m/b.mkv", false)],
        );

        assert_eq!(item.default_file_id.as_deref(), Some("a"));
        // Browsable - container and path - but no stream data invented for it.
        assert_eq!(item.container, "mkv");
        assert_eq!(item.rel_path.as_deref(), Some("a.mkv"));
        assert!(item.video.is_none());
        assert!(item.duration_ms.is_none());
    }

    #[test]
    fn a_demo_file_is_never_streamable() {
        let mut item = bare_item();
        apply_files(&mut item, vec![file("d", "demo://sample", true)]);

        // The synthetic path must NOT reach `abs_path`, so `/stream` answers the
        // demo error instead of trying to open a file that does not exist.
        assert!(item.abs_path.is_none());
        // It is still the representative file, so the item is browsable.
        assert_eq!(item.default_file_id.as_deref(), Some("d"));
        assert_eq!(item.duration_ms, Some(7_200_000));
    }

    #[test]
    fn a_real_path_is_exposed_for_streaming() {
        let mut item = bare_item();
        apply_files(&mut item, vec![file("a", "/media/a.mkv", true)]);
        assert_eq!(item.abs_path.as_deref(), Some("/media/a.mkv"));
    }

    #[test]
    fn every_file_is_kept_whichever_one_represents_the_item() {
        let mut item = bare_item();
        apply_files(
            &mut item,
            vec![
                file("a", "/m/a.mkv", false),
                file("b", "/m/b.mkv", true),
                file("c", "/m/c.mkv", false),
            ],
        );
        // The picker offers all of them (Director's Cut + Theatrical, 1080p + 4K);
        // only the representative fills the legacy top-level fields.
        assert_eq!(item.files.len(), 3);
        assert_eq!(item.default_file_id.as_deref(), Some("b"));
    }
}
