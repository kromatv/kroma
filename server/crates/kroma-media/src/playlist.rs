//! Writing the media credential into the playlist text.
//!
//! hls.js, AVPlay, Safari and mpv all resolve a playlist's URIs against the
//! playlist's own URL and carry none of its query, so a credential on the master
//! reaches no segment unless the body the player reads carries it too.

use crate::Credential;

const BYTES_PER_URI: usize = 32;

/// The same playlist with every URI rewritten to `base` + the name it carries +
/// `credential`. An empty `base` leaves the name relative to the playlist's own
/// URL, and a caller with neither gets its playlist back untouched.
pub fn with_base(playlist: &str, base: &str, credential: &Credential) -> String {
    let credential = credential.query();
    if base.is_empty() && credential.is_empty() {
        return playlist.to_string();
    }
    let around = base.len() + credential.len();
    let mut out = String::with_capacity(playlist.len() + playlist.len() / BYTES_PER_URI * around);
    for line in playlist.lines() {
        if line.starts_with('#') {
            push_attribute(&mut out, line, base, credential);
        } else if !line.is_empty() {
            out.push_str(base);
            out.push_str(line);
            out.push_str(credential);
        }
        out.push('\n');
    }
    out
}

// `#EXT-X-MAP:URI="init.mp4"` points at the initialisation segment, which the
// player fetches like any other child.
fn push_attribute(out: &mut String, tag: &str, base: &str, credential: &str) {
    const URI: &str = "URI=\"";
    let Some(start) = tag.find(URI).map(|i| i + URI.len()) else {
        out.push_str(tag);
        return;
    };
    let Some(end) = tag[start..].find('"').map(|i| start + i) else {
        out.push_str(tag);
        return;
    };
    out.push_str(&tag[..start]);
    out.push_str(base);
    out.push_str(&tag[start..end]);
    out.push_str(credential);
    out.push_str(&tag[end..]);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ticket() -> Credential {
        Credential::new("t", Some("dev.999.sig"))
    }

    #[test]
    fn every_uri_a_player_will_fetch_leaves_the_playlist_credentialed() {
        let playlist = concat!(
            "#EXTM3U\n",
            "#EXT-X-TARGETDURATION:4\n",
            "#EXT-X-MAP:URI=\"init.mp4\"\n",
            "#EXTINF:4.000000,\n",
            "seg00001.m4s\n",
            "#EXTINF:4.000000,\n",
            "seg00002.m4s\n",
        );

        let stamped = with_base(playlist, "", &ticket());

        assert_eq!(
            stamped,
            concat!(
                "#EXTM3U\n",
                "#EXT-X-TARGETDURATION:4\n",
                "#EXT-X-MAP:URI=\"init.mp4?t=dev.999.sig\"\n",
                "#EXTINF:4.000000,\n",
                "seg00001.m4s?t=dev.999.sig\n",
                "#EXTINF:4.000000,\n",
                "seg00002.m4s?t=dev.999.sig\n",
            )
        );
    }

    #[test]
    fn a_tag_with_no_uri_and_a_blank_line_are_left_alone() {
        let stamped = with_base(
            "#EXT-X-ENDLIST\n\n#EXT-X-MAP:BYTERANGE=0\n",
            "",
            &Credential::new("t", Some("tkt")),
        );

        assert_eq!(stamped, "#EXT-X-ENDLIST\n\n#EXT-X-MAP:BYTERANGE=0\n");
    }

    #[test]
    fn an_unterminated_uri_attribute_is_handed_back_rather_than_mangled() {
        let stamped = with_base(
            "#EXT-X-MAP:URI=\"init.mp4\n",
            "",
            &Credential::new("t", Some("tkt")),
        );

        assert_eq!(stamped, "#EXT-X-MAP:URI=\"init.mp4\n");
    }

    #[test]
    fn a_playlist_nobody_has_to_present_a_credential_for_is_not_rewritten() {
        let playlist = "#EXTM3U\r\nseg00001.m4s\r\n";

        assert_eq!(
            with_base(playlist, "", &Credential::new("t", None)),
            playlist
        );
    }

    #[test]
    fn a_base_moves_every_child_off_the_path_the_playlist_was_served_at() {
        let playlist = "#EXT-X-MAP:URI=\"init.mp4\"\nseg00001.m4s\n";

        let moved = with_base(playlist, "/watch/d1/hls/aac/0/0/", &ticket());

        assert_eq!(
            moved,
            concat!(
                "#EXT-X-MAP:URI=\"/watch/d1/hls/aac/0/0/init.mp4?t=dev.999.sig\"\n",
                "/watch/d1/hls/aac/0/0/seg00001.m4s?t=dev.999.sig\n",
            )
        );
    }
}
