//! Writing the media credential into the playlist text.
//!
//! hls.js, AVPlay, Safari and mpv all resolve a playlist's URIs against the
//! playlist's own URL and carry none of its query, so a credential on the master
//! reaches no segment unless the body the player reads carries it too.

use crate::Credential;

const BYTES_PER_URI: usize = 32;

/// The same playlist with `credential` appended to every URI a player will
/// fetch. A caller whose credential is empty gets its playlist back untouched.
pub fn with_credential(playlist: &str, credential: &Credential) -> String {
    let credential = credential.query();
    if credential.is_empty() {
        return playlist.to_string();
    }
    let mut out =
        String::with_capacity(playlist.len() + playlist.len() / BYTES_PER_URI * credential.len());
    for line in playlist.lines() {
        if line.starts_with('#') {
            push_attribute(&mut out, line, credential);
        } else if !line.is_empty() {
            out.push_str(line);
            out.push_str(credential);
        }
        out.push('\n');
    }
    out
}

// `#EXT-X-MAP:URI="init.mp4"` points at the initialisation segment, which the
// player fetches like any other child.
fn push_attribute(out: &mut String, tag: &str, credential: &str) {
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

        let stamped = with_credential(playlist, &ticket());

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
        let stamped = with_credential(
            "#EXT-X-ENDLIST\n\n#EXT-X-MAP:BYTERANGE=0\n",
            &Credential::new("t", Some("tkt")),
        );

        assert_eq!(stamped, "#EXT-X-ENDLIST\n\n#EXT-X-MAP:BYTERANGE=0\n");
    }

    #[test]
    fn an_unterminated_uri_attribute_is_handed_back_rather_than_mangled() {
        let stamped = with_credential(
            "#EXT-X-MAP:URI=\"init.mp4\n",
            &Credential::new("t", Some("tkt")),
        );

        assert_eq!(stamped, "#EXT-X-MAP:URI=\"init.mp4\n");
    }

    #[test]
    fn a_playlist_nobody_has_to_present_a_credential_for_is_not_rewritten() {
        let playlist = "#EXTM3U\r\nseg00001.m4s\r\n";

        assert_eq!(
            with_credential(playlist, &Credential::new("t", None)),
            playlist
        );
    }
}
