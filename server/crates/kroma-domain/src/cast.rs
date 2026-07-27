//! Cast: the vocabulary for driving playback on *another* device.
//!
//! A TV app advertises itself as a **receiver**; a phone or a browser acts as a
//! **sender** that launches a title on it and then works as a remote. These are
//! the wire types both sides speak - pure data, no I/O (the live roster lives in
//! `kroma-engine`'s `services::cast`).

use serde::{Deserialize, Serialize};

use crate::media::MediaItem;

/// What a receiver is doing right now. `buffering` is "playing, but stalled" -
/// senders keep the pause button, they just show a spinner.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CastState {
    Idle,
    Playing,
    Paused,
    Buffering,
    /// Anything a newer client invents. Kept so an older server never rejects a
    /// heartbeat it merely doesn't recognize.
    #[serde(other)]
    Unknown,
}

/// What a receiver reports about its own playback on each heartbeat. It knows
/// the item only by id; the server resolves that to the catalog entry senders
/// render (see [`CastNowPlaying`]).
#[derive(Debug, Clone, Deserialize)]
pub struct CastPlayback {
    #[serde(rename = "itemId")]
    pub item_id: String,
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs", default)]
    pub duration_ms: Option<i64>,
    pub state: CastState,
    /// Label of the selected audio track, as the receiver's player names it.
    #[serde(default)]
    pub audio: Option<String>,
    /// Label of the selected subtitle track (absent / "off" → none).
    #[serde(default)]
    pub subtitle: Option<String>,
}

/// What a receiver is playing, as senders render it: the catalog item (so the
/// remote has the poster and the title without a second round-trip) plus the
/// live transport state.
#[derive(Debug, Clone, Serialize)]
pub struct CastNowPlaying {
    pub item: MediaItem,
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<i64>,
    pub state: CastState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
}

/// One live receiver in the picker.
#[derive(Debug, Clone, Serialize)]
pub struct CastReceiver {
    pub id: String,
    /// Human name the device gave itself ("Salon", "Chambre").
    pub name: String,
    /// Platform label shown under the name ("Apple TV", "Tizen", "webOS").
    pub platform: String,
    /// Whether the reader's own account registered this receiver (the picker puts
    /// "my" devices first). A boolean rather than the owner's account id: the
    /// roster is readable by every viewer and carries no internal identifiers.
    pub mine: bool,
    /// Profile the TV is signed into. Shown in the picker because a household TV
    /// usually runs its own profile, not the sender's.
    pub username: String,
    /// `LAN` | `WAN`, from the same classifier the playback dashboard uses.
    pub network: String,
    #[serde(rename = "nowPlaying", skip_serializing_if = "Option::is_none")]
    pub now_playing: Option<CastNowPlaying>,
}

/// An order from a sender to a receiver.
///
/// `SkipNext` carries no target on purpose: the receiver already knows what
/// follows the episode it is playing (its up-next logic), and resolving it here
/// would race the TV's own idea of "current".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CastCommand {
    /// Start a title (`positionMs` resumes mid-film; 0 starts over).
    Play {
        #[serde(rename = "itemId")]
        item_id: String,
        #[serde(rename = "positionMs", default)]
        position_ms: i64,
    },
    Pause,
    Resume,
    /// Toggle play/pause - what a remote's single ⏯ button sends.
    TogglePlay,
    Seek {
        #[serde(rename = "positionMs")]
        position_ms: i64,
    },
    /// Relative jump in milliseconds; negative goes back.
    Skip {
        #[serde(rename = "deltaMs")]
        delta_ms: i64,
    },
    /// Play whatever follows the current title (next episode).
    SkipNext,
    /// Leave the player (back to the TV's home screen).
    Stop,
    /// Select an audio track by its index in the receiver's own track list.
    SetAudio { index: usize },
    /// Select a subtitle track by index, or `null` to turn subtitles off.
    SetSubtitle { index: Option<usize> },
}

/// A command as it travels: sequenced, so a receiver that gets it twice (WS push
/// *and* the heartbeat response) applies it once, and acks it by number.
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

        // Unit variants are camelCased, and `positionMs` defaults to 0.
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
