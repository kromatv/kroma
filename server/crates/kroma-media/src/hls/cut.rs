use super::naming::seg_index;

pub(super) struct Cut {
    pub(super) playlist: String,
    pub(super) first: String,
    pub(super) sequence: u64,
}

/// `#EXT-X-MEDIA-SEQUENCE` names the first segment kept, which RFC 8216
/// §4.3.3.2 requires of a playlist that does not begin at sequence zero.
pub(super) fn from_the_second(playlist: &str, second: f64) -> Option<Cut> {
    let mut header = String::new();
    let mut kept = String::new();
    let mut cut: Option<(String, u64)> = None;
    let mut spanned = 0.0;
    let mut span = 0.0;
    let mut pending = "";
    for line in playlist.lines() {
        if let Some(seconds) = line.strip_prefix("#EXTINF:") {
            span = seconds.trim_end_matches(',').trim().parse().unwrap_or(0.0);
            pending = line;
            continue;
        }
        if line.starts_with("#EXT-X-ENDLIST") {
            if cut.is_some() {
                kept.push_str("#EXT-X-ENDLIST\n");
            }
            continue;
        }
        if line.is_empty() {
            continue;
        }
        if line.starts_with('#') {
            if cut.is_none() && !line.starts_with("#EXT-X-MEDIA-SEQUENCE") {
                header.push_str(line);
                header.push('\n');
            }
            continue;
        }
        let name = line.trim();
        if cut.is_none() && second < spanned + span {
            cut = Some((name.to_string(), seg_index(name)?));
        }
        if cut.is_some() {
            kept.push_str(pending);
            kept.push('\n');
            kept.push_str(name);
            kept.push('\n');
        }
        spanned += span;
    }
    let (first, sequence) = cut?;
    Some(Cut {
        playlist: format!("{header}#EXT-X-MEDIA-SEQUENCE:{sequence}\n{kept}"),
        first,
        sequence,
    })
}

const FROM_THE_FIRST_SEGMENT: &str = "#EXT-X-START:TIME-OFFSET=0";

pub(super) fn from_its_first_segment(playlist: String) -> String {
    if playlist.contains("#EXT-X-START:") {
        return playlist;
    }
    match playlist.split_once('\n') {
        Some((head, rest)) if head.trim_end() == "#EXTM3U" => {
            format!("{head}\n{FROM_THE_FIRST_SEGMENT}\n{rest}")
        }
        _ => playlist,
    }
}

#[cfg(test)]
mod tests {
    use super::super::session::testing::PLAYLIST;
    use super::*;

    #[test]
    fn a_playlist_cut_at_a_second_starts_on_the_segment_carrying_it() {
        let cut = from_the_second(PLAYLIST, 7.0).expect("inside the playlist");

        assert_eq!(cut.first, "seg_00001.m4s");
        assert_eq!(cut.sequence, 1);
    }

    #[test]
    fn a_cut_playlist_keeps_the_header_and_names_where_it_now_begins() {
        let cut = from_the_second(PLAYLIST, 13.0).expect("inside the playlist");

        assert!(cut.playlist.starts_with("#EXTM3U\n"), "{}", cut.playlist);
        assert!(cut.playlist.contains("#EXT-X-MAP:URI=\"init.mp4\""));
        assert!(cut.playlist.contains("#EXT-X-MEDIA-SEQUENCE:2\n"));
        assert!(!cut.playlist.contains("#EXT-X-MEDIA-SEQUENCE:0"));
        assert!(!cut.playlist.contains("seg_00001.m4s"));
        assert_eq!(cut.playlist.matches("#EXTINF:").count(), 1);
    }

    #[test]
    fn a_playlist_cut_at_its_own_beginning_is_the_playlist() {
        let cut = from_the_second(PLAYLIST, 0.0).expect("inside the playlist");

        assert_eq!(cut.first, "seg_00000.m4s");
        assert_eq!(cut.playlist.matches("#EXTINF:").count(), 3);
    }

    #[test]
    fn a_second_the_playlist_has_not_reached_cuts_nothing() {
        assert!(from_the_second(PLAYLIST, 16.0).is_none());
        assert!(from_the_second("#EXTM3U\n", 0.0).is_none());
    }

    #[test]
    fn a_finished_playlist_keeps_saying_so_after_the_cut() {
        let ended = format!("{PLAYLIST}#EXT-X-ENDLIST\n");

        let cut = from_the_second(&ended, 7.0).expect("inside the playlist");

        assert!(
            cut.playlist.ends_with("#EXT-X-ENDLIST\n"),
            "{}",
            cut.playlist
        );
    }

    #[test]
    fn a_playlist_still_growing_tells_the_player_to_start_at_its_first_segment() {
        let started = from_its_first_segment(PLAYLIST.to_string());

        assert_eq!(
            started,
            PLAYLIST.replacen("#EXTM3U\n", "#EXTM3U\n#EXT-X-START:TIME-OFFSET=0\n", 1)
        );
    }

    #[test]
    fn a_finished_playlist_still_starts_at_its_first_segment() {
        let ended = format!("{PLAYLIST}#EXT-X-ENDLIST\n");

        let started = from_its_first_segment(ended);

        assert!(started.starts_with("#EXTM3U\n#EXT-X-START:TIME-OFFSET=0\n"));
        assert!(started.ends_with("#EXT-X-ENDLIST\n"));
    }

    #[test]
    fn a_cut_playlist_starts_at_the_segment_it_was_cut_on() {
        let cut = from_the_second(PLAYLIST, 7.0).expect("inside the playlist");

        let started = from_its_first_segment(cut.playlist);

        assert!(started.starts_with("#EXTM3U\n#EXT-X-START:TIME-OFFSET=0\n"));
        assert!(started.contains("#EXT-X-MEDIA-SEQUENCE:1\n"));
    }

    #[test]
    fn a_playlist_that_already_names_its_start_is_served_as_it_is() {
        let named = PLAYLIST.replacen("#EXTM3U\n", "#EXTM3U\n#EXT-X-START:TIME-OFFSET=12\n", 1);

        let started = from_its_first_segment(named.clone());

        assert_eq!(started, named);
    }

    #[test]
    fn text_that_is_not_a_playlist_is_handed_back_untouched() {
        let started = from_its_first_segment("partial".to_string());

        assert_eq!(started, "partial");
    }
}
