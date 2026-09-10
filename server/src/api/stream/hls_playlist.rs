//! Writing the media credential into the playlist text.
//!
//! hls.js, AVPlay, Safari and mpv all resolve a playlist's URIs against the
//! playlist's own URL and carry none of its query, so a ticket on the master
//! reaches no segment unless the body the player reads carries it too.

use crate::api::media_ticket;

/// The same playlist with `ticket` on every URI the player will fetch for itself.
pub fn ticketed(playlist: &str, ticket: &str) -> String {
    let credential = format!("?{}={ticket}", media_ticket::PARAM);
    let mut out =
        String::with_capacity(playlist.len() + playlist.lines().count() * credential.len());
    for line in playlist.lines() {
        match line.starts_with('#') {
            true => out.push_str(&ticketed_attribute(line, &credential)),
            false if line.is_empty() => out.push_str(line),
            false => {
                out.push_str(line);
                out.push_str(&credential);
            }
        }
        out.push('\n');
    }
    out
}

// `#EXT-X-MAP:URI="init.mp4"` points at the initialisation segment, which the
// player fetches like any other child.
fn ticketed_attribute(tag: &str, credential: &str) -> String {
    const URI: &str = "URI=\"";
    let Some(start) = tag.find(URI).map(|i| i + URI.len()) else {
        return tag.to_string();
    };
    let Some(end) = tag[start..].find('"').map(|i| start + i) else {
        return tag.to_string();
    };
    format!("{}{credential}{}", &tag[..end], &tag[end..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_uri_a_player_will_fetch_leaves_the_playlist_ticketed() {
        let playlist = concat!(
            "#EXTM3U\n",
            "#EXT-X-TARGETDURATION:4\n",
            "#EXT-X-MAP:URI=\"init.mp4\"\n",
            "#EXTINF:4.000000,\n",
            "seg00001.m4s\n",
            "#EXTINF:4.000000,\n",
            "seg00002.m4s\n",
        );

        let stamped = ticketed(playlist, "dev.999.sig");

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
        let stamped = ticketed("#EXT-X-ENDLIST\n\n#EXT-X-MAP:BYTERANGE=0\n", "tkt");

        assert_eq!(stamped, "#EXT-X-ENDLIST\n\n#EXT-X-MAP:BYTERANGE=0\n");
    }

    #[test]
    fn an_unterminated_uri_attribute_is_handed_back_rather_than_mangled() {
        let stamped = ticketed("#EXT-X-MAP:URI=\"init.mp4\n", "tkt");

        assert_eq!(stamped, "#EXT-X-MAP:URI=\"init.mp4\n");
    }
}
