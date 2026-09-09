//! Grouping an item's files into the editions they realise, and ranking them.

use kroma_domain::{by_preference, edition_cut, edition_id, Edition, MediaFile, MediaItem};

/// Rank `files` best-first by MEDIA-8, stamp each with the edition it belongs to,
/// and list those editions on the item with the one holding the preferred file
/// first. Every file lands in exactly one edition and every edition has at least
/// one file, so the title to edition to media file nesting is total.
pub(super) fn apply_editions(item: &mut MediaItem, mut files: Vec<MediaFile>) -> Vec<MediaFile> {
    files.sort_by(by_preference);
    for file in files.iter_mut() {
        file.edition_id = Some(edition_id(&item.id, file.edition.as_deref()));
    }
    item.editions = editions_of(&files);
    files
}

// First sighting wins, and the files arrive preferred-first, so the edition of the
// preferred file leads and each edition's runtime is its own preferred file's.
fn editions_of(files: &[MediaFile]) -> Vec<Edition> {
    let mut editions: Vec<Edition> = Vec::new();
    for file in files {
        let Some(id) = file.edition_id.as_deref() else {
            continue;
        };
        if editions.iter().any(|e| e.id == id) {
            continue;
        }
        editions.push(Edition {
            id: id.to_string(),
            name: edition_cut(file.edition.as_deref()).map(str::to_owned),
            duration_ms: file.duration_ms,
        });
    }
    editions
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_domain::{Kind, VideoStream};

    fn item() -> MediaItem {
        MediaItem {
            id: "m1".into(),
            title: "Blade Runner".into(),
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

    fn file(id: &str, edition: Option<&str>, width: u32, duration_ms: u64) -> MediaFile {
        MediaFile {
            id: id.into(),
            rel_path: None,
            container: "mkv".into(),
            duration_ms: Some(duration_ms),
            video: Some(VideoStream {
                codec: "hevc".into(),
                width: Some(width),
                height: None,
                hdr: false,
                bit_depth: Some(8),
                hdr_format: None,
                dolby_vision_profile: None,
                color: None,
            }),
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            size: None,
            edition: edition.map(str::to_owned),
            probed: true,
            unreadable: None,
            edition_id: None,
            abs_path: None,
        }
    }

    #[test]
    fn two_fidelities_of_one_cut_are_one_edition_with_two_files() {
        let mut item = item();

        let files = apply_editions(
            &mut item,
            vec![
                file("hd", Some("Theatrical"), 1920, 7_000_000),
                file("uhd", Some("Theatrical"), 3840, 7_000_000),
            ],
        );

        assert_eq!(item.editions.len(), 1);
        assert_eq!(item.editions[0].name.as_deref(), Some("Theatrical"));
        assert_eq!(files[0].id, "uhd", "the preferred file leads");
        assert_eq!(files[0].edition_id, files[1].edition_id);
    }

    #[test]
    fn two_cuts_are_two_editions_each_carrying_its_own_runtime() {
        let mut item = item();

        apply_editions(
            &mut item,
            vec![
                file("theatrical", Some("Theatrical"), 1920, 7_000_000),
                file("extended", Some("Extended"), 3840, 9_000_000),
            ],
        );

        assert_eq!(item.editions.len(), 2);
        assert_eq!(
            item.editions[0].name.as_deref(),
            Some("Extended"),
            "the edition holding the preferred file leads"
        );
        assert_eq!(item.editions[0].duration_ms, Some(9_000_000));
        assert_eq!(item.editions[1].duration_ms, Some(7_000_000));
    }

    #[test]
    fn a_title_whose_files_name_no_cut_still_has_one_unnamed_edition() {
        let mut item = item();

        let files = apply_editions(
            &mut item,
            vec![
                file("a", None, 1920, 7_000_000),
                file("b", Some("4K"), 3840, 7_000_000),
            ],
        );

        assert_eq!(item.editions.len(), 1, "a quality tier is not a cut");
        assert!(item.editions[0].name.is_none());
        assert_eq!(files[0].edition_id, files[1].edition_id);
    }

    #[test]
    fn a_file_names_its_edition_under_the_key_a_client_reads() {
        let mut item = item();

        let files = apply_editions(&mut item, vec![file("a", Some("Extended"), 1920, 1)]);

        let json = serde_json::to_string(&files[0]).unwrap();
        assert!(json.contains(r#""editionId":"m1:extended""#), "{json}");
    }

    #[test]
    fn an_item_with_no_files_lists_no_editions() {
        let mut item = item();

        assert!(apply_editions(&mut item, Vec::new()).is_empty());
        assert!(item.editions.is_empty());
    }
}
