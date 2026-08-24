use crate::model::{CastCommandEnvelope, CastPlayback, CastState, CastTrack, Kind, MediaItem};

use super::{Announce, Announced, Registry};

pub(super) fn item(id: &str) -> MediaItem {
    MediaItem {
        id: id.into(),
        title: "The Film".into(),
        kind: Kind::Movie,
        year: Some(2020),
        duration_ms: Some(7_200_000),
        container: "mkv".into(),
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
        default_file_id: None,
        markers: Vec::new(),
        audio_analysis: None,
    }
}

pub(super) fn playing(item_id: &str, position_ms: i64) -> CastPlayback {
    CastPlayback {
        item_id: item_id.into(),
        position_ms,
        duration_ms: Some(7_200_000),
        state: CastState::Playing,
        audio_tracks: vec![CastTrack {
            index: 0,
            label: "English 5.1".into(),
        }],
        audio_index: Some(0),
        subtitles: Vec::new(),
        subtitle_index: None,
    }
}

pub(super) fn beat(id: &str, seq: u64, playback: Option<CastPlayback>) -> Announce {
    Announce {
        receiver_id: id.into(),
        name: "Salon".into(),
        platform: "Apple TV".into(),
        last_applied_seq: seq,
        playback,
    }
}

pub(super) fn announce_ok(
    reg: &Registry,
    ann: Announce,
    user: &str,
    item: Option<MediaItem>,
) -> Vec<CastCommandEnvelope> {
    match reg.announce(ann, user, "Alice", "LAN".into(), item) {
        Announced::Ok { commands, .. } => commands,
        _ => panic!("expected the announce to be accepted"),
    }
}
