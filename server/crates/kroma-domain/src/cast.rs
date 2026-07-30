//! Cast: the wire vocabulary for driving playback on another device. A TV app
//! is a **receiver**; a phone or browser is a **sender** acting as its remote.
//! Pure data, no I/O - the live roster lives in `kroma-engine`'s `services::cast`.

use serde::{Deserialize, Serialize};

use crate::media::MediaItem;

/// `Buffering` is "playing, but stalled" - senders keep the pause button.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CastState {
    Idle,
    Playing,
    Paused,
    Buffering,
    // Anything a newer client invents, so an older server never rejects a
    // heartbeat it merely doesn't recognize.
    #[serde(other)]
    Unknown,
}

/// A track as *the receiver's* player numbers them: its subtitle list also holds
/// AI-generated tracks the catalog item never had.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CastTrack {
    pub index: i64,
    pub label: String,
}

/// What a receiver reports about its own playback on each heartbeat.
#[derive(Debug, Clone, Deserialize)]
pub struct CastPlayback {
    #[serde(rename = "itemId")]
    pub item_id: String,
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs", default)]
    pub duration_ms: Option<i64>,
    pub state: CastState,
    #[serde(rename = "audioTracks", default)]
    pub audio_tracks: Vec<CastTrack>,
    #[serde(rename = "audioIndex", default)]
    pub audio_index: Option<i64>,
    // A `None` subtitle_index means subtitles off.
    #[serde(default)]
    pub subtitles: Vec<CastTrack>,
    #[serde(rename = "subtitleIndex", default)]
    pub subtitle_index: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CastNowPlaying {
    pub item: MediaItem,
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<i64>,
    pub state: CastState,
    #[serde(rename = "audioTracks")]
    pub audio_tracks: Vec<CastTrack>,
    #[serde(rename = "audioIndex", skip_serializing_if = "Option::is_none")]
    pub audio_index: Option<i64>,
    pub subtitles: Vec<CastTrack>,
    #[serde(rename = "subtitleIndex", skip_serializing_if = "Option::is_none")]
    pub subtitle_index: Option<i64>,
}

/// A sender currently driving a receiver. Presence is that sender's socket, so
/// a device that walks out of the room leaves the list on its own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CastController {
    // Server-minted and socket-scoped, never client-supplied, so one sender
    // cannot impersonate another in the list a television shows.
    pub id: String,
    pub name: String,
    pub username: String,
    #[serde(rename = "avatarUrl", skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CastReceiver {
    pub id: String,
    pub name: String,
    pub platform: String,
    // Deliberately the only identity here: no account id and no per-reader
    // "mine" flag, so one row can be pushed unchanged to every viewer.
    pub username: String,
    pub network: String,
    #[serde(rename = "nowPlaying", skip_serializing_if = "Option::is_none")]
    pub now_playing: Option<CastNowPlaying>,
    pub controllers: Vec<CastController>,
}

/// An order from a sender to a receiver. `SkipNext` carries no target on
/// purpose: resolving it here would race the TV's own idea of "current".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CastCommand {
    Play {
        #[serde(rename = "itemId")]
        item_id: String,
        #[serde(rename = "positionMs", default)]
        position_ms: i64,
    },
    Pause,
    Resume,
    TogglePlay,
    Seek {
        #[serde(rename = "positionMs")]
        position_ms: i64,
    },
    // Relative jump in milliseconds; negative goes back.
    Skip {
        #[serde(rename = "deltaMs")]
        delta_ms: i64,
    },
    SkipNext,
    Stop,
    SetAudio { index: usize },
    // `null` turns subtitles off.
    SetSubtitle { index: Option<usize> },
}

/// Sequenced so a receiver that gets a command twice (WS push *and* the
/// heartbeat response) applies it once, and acks it by number.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CastCommandEnvelope {
    pub seq: u64,
    pub command: CastCommand,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commands_round_trip_as_tagged_json() {
        let play = CastCommand::Play {
            item_id: "it1".into(),
            position_ms: 42,
        };
        let json = serde_json::to_string(&play).unwrap();
        assert_eq!(json, r#"{"type":"play","itemId":"it1","positionMs":42}"#);
        assert_eq!(serde_json::from_str::<CastCommand>(&json).unwrap(), play);

        assert_eq!(serde_json::to_string(&CastCommand::SkipNext).unwrap(), r#"{"type":"skipNext"}"#);
        assert_eq!(
            serde_json::from_str::<CastCommand>(r#"{"type":"play","itemId":"x"}"#).unwrap(),
            CastCommand::Play { item_id: "x".into(), position_ms: 0 }
        );
        // Subtitles off is an explicit null, not an omission.
        assert_eq!(
            serde_json::to_string(&CastCommand::SetSubtitle { index: None }).unwrap(),
            r#"{"type":"setSubtitle","index":null}"#
        );
    }

    #[test]
    fn an_unknown_state_does_not_fail_a_heartbeat() {
        let p: CastPlayback =
            serde_json::from_str(r#"{"itemId":"i","positionMs":1,"state":"levitating"}"#).unwrap();
        assert_eq!(p.state, CastState::Unknown);
        assert_eq!(p.duration_ms, None);
    }
}
