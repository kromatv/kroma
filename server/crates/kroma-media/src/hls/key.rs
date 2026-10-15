//! The session key, `{item_id}:{mode}:{anchor_secs}:a{audio}`, and the
//! predicates that read a program out of one. The mode is part of the key
//! because filtered, transcoded and clean programs must never share segment
//! URLs (segments are cached immutably per URL).

use super::StreamMode;

pub(super) fn session_key(item_id: &str, mode: StreamMode, anchor: u64, audio: u32) -> String {
    format!("{item_id}:{}:{anchor}:a{audio}", mode.token())
}

// Split from the right because an item id may itself contain a colon.
fn without_anchor(key: &str) -> Option<(&str, &str)> {
    let (head, audio) = key.rsplit_once(':')?;
    let (item_and_mode, _anchor) = head.rsplit_once(':')?;
    Some((item_and_mode, audio))
}

// The `(item_id, a{audio})` a key identifies, apart from mode and anchor.
pub(super) fn program_of(key: &str) -> Option<(&str, &str)> {
    let (item_and_mode, audio) = without_anchor(key)?;
    let (item, _mode) = item_and_mode.rsplit_once(':')?;
    Some((item, audio))
}

pub(super) fn same_but_the_anchor(a: &str, b: &str) -> bool {
    match (without_anchor(a), without_anchor(b)) {
        (Some(x), Some(y)) => x == y,
        _ => false,
    }
}

// Whether two session keys play the same program and differ only in mode /
// anchor - used by the session registry to pick a victim under the
// concurrency cap (see `Sessions::make_room`).
pub(super) fn same_program(a: &str, b: &str) -> bool {
    match (program_of(a), program_of(b)) {
        (Some(x), Some(y)) => x == y,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hls::{AudioMode, VideoMode};

    const fn audio(audio: AudioMode) -> StreamMode {
        StreamMode::new(VideoMode::Copy, audio)
    }

    #[test]
    fn session_keys_keep_filtered_programs_apart() {
        let clean = session_key("it1", audio(AudioMode::Aac), 30, 1);
        let night = session_key("it1", audio(AudioMode::AacNight), 30, 1);
        assert_eq!(clean, "it1:aac:30:a1");
        assert_eq!(night, "it1:aac-night:30:a1");
        assert_ne!(clean, night);
    }

    #[test]
    fn session_keys_keep_a_transcoded_picture_apart_from_a_copied_one() {
        let copied = session_key("it1", audio(AudioMode::Aac), 30, 1);
        let recoded = session_key(
            "it1",
            StreamMode::new(VideoMode::H264, AudioMode::Aac),
            30,
            1,
        );
        assert_eq!(recoded, "it1:h264-aac:30:a1");
        assert_ne!(copied, recoded);
    }

    #[test]
    fn same_program_spans_anchors_and_modes_only() {
        let key = session_key("it1", audio(AudioMode::Aac), 30, 1);
        assert!(same_program(
            &key,
            &session_key("it1", audio(AudioMode::Aac), 900, 1)
        ));
        assert!(same_program(
            &key,
            &session_key("it1", audio(AudioMode::AacNight), 30, 1)
        ));
        assert!(same_program(
            &key,
            &session_key(
                "it1",
                StreamMode::new(VideoMode::H264, AudioMode::Aac),
                30,
                1
            )
        ));
        assert!(!same_program(
            &key,
            &session_key("it1", audio(AudioMode::Aac), 30, 2)
        ));
        assert!(!same_program(
            &key,
            &session_key("it2", audio(AudioMode::Aac), 30, 1)
        ));
        assert!(!same_program(&key, "nonsense"));
        assert!(!same_program("nonsense", "nonsense"));
    }

    #[test]
    fn program_of_tolerates_a_colon_in_the_item_id() {
        assert_eq!(
            program_of("tv:s1e2:aac-night:30:a1"),
            Some(("tv:s1e2", "a1"))
        );
        assert_eq!(program_of("it1:copy:0:a0"), Some(("it1", "a0")));
        assert_eq!(program_of("bogus"), None);
    }
}
