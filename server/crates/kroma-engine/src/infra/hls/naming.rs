//! Segment file naming: what ffmpeg writes, what a request may ask for, and
//! where a session's files live. The write pattern (`ffmpeg::SEGMENT_PATTERN`)
//! and [`seg_index`] are two halves of one convention, so they are pinned
//! together by `round_trips_the_ffmpeg_pattern` below.

use kroma_primitives::short_hash;

/// The index of a media segment, or `None` for the init file, the playlist, or
/// anything else.
pub fn seg_index(name: &str) -> Option<u64> {
    name.strip_prefix("seg_")?
        .strip_suffix(".m4s")?
        .parse()
        .ok()
}

/// Rejects anything that is not a bare filename: the request path is
/// attacker-controlled and joins onto the session directory.
pub fn is_safe_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains("..")
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

/// The on-disk directory for a session key. Hashed rather than sanitised: the
/// old character map sent `a:b` and `a_b` to the same directory, where one
/// session's `remove_dir_all` would take the other's segments with it and two
/// ffmpegs would write the same `seg_%05d.m4s` names.
pub fn session_dir(key: &str) -> String {
    short_hash(key)
}

pub fn content_type(name: &str) -> &'static str {
    if name.ends_with(".m3u8") {
        "application/vnd.apple.mpegurl"
    } else if name.ends_with(".mp4") {
        "video/mp4"
    } else {
        "video/iso.segment"
    }
}

pub fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_name() {
        assert!(is_safe_name("seg_00001.m4s"));
        assert!(is_safe_name("init.mp4"));
        assert!(!is_safe_name("../x"));
        assert!(!is_safe_name("a/b"));
        assert!(!is_safe_name(""));
    }

    #[test]
    fn seg_indices() {
        assert_eq!(seg_index("seg_00042.m4s"), Some(42));
        assert_eq!(seg_index("seg_00000.m4s"), Some(0));
        assert_eq!(seg_index("init.mp4"), None);
        assert_eq!(seg_index("index.m3u8"), None);
        assert_eq!(seg_index("seg_.m4s"), None);
    }

    // The parser and the ffmpeg write pattern drifted apart once already: the
    // tests asserted on a `seg_0_00001.m4s` shape that nothing produced.
    #[test]
    fn round_trips_the_ffmpeg_pattern() {
        let name = super::super::ffmpeg::SEGMENT_PATTERN.replace("%05d", "00007");
        assert_eq!(seg_index(&name), Some(7));
    }

    #[test]
    fn content_types() {
        assert_eq!(content_type("index.m3u8"), "application/vnd.apple.mpegurl");
        assert_eq!(content_type("init.mp4"), "video/mp4");
        assert_eq!(content_type("seg_00001.m4s"), "video/iso.segment");
    }

    #[test]
    fn session_dirs_do_not_collide_on_punctuation() {
        assert_ne!(
            session_dir("tv:s1e2:copy:0:a0"),
            session_dir("tv_s1e2_copy_0_a0")
        );
        assert_eq!(session_dir("it1:copy:0:a0"), session_dir("it1:copy:0:a0"));
        assert!(is_safe_name(&session_dir("tv:s1e2:copy:0:a0")));
    }
}
