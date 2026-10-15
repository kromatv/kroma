//! Narrowing a requested [`StreamMode`] to what the client says it can take:
//! the codecs it declared it decodes, the bit depth behind one of those names,
//! and the frame size its decoder holds.

use super::{AudioMode, Rung, StreamMode, VideoMode};

const H264_10BIT: &str = "h26410bit";
const H264: &str = "h264";

impl StreamMode {
    /// The mode whose audio will actually reach the speakers, given the selected
    /// track's codec and the comma-separated set the client declared it can decode
    /// (`None` = declared nothing, and the request stands). Only an audio copy is
    /// ever overridden, and only the audio axis moves.
    pub fn for_client_audio(self, codec: Option<&str>, client_decodes: Option<&str>) -> Self {
        match (self.audio, client_decodes) {
            (AudioMode::Copy, Some(set)) if !client_can_play(codec, set) => Self {
                audio: AudioMode::Aac,
                ..self
            },
            _ => self,
        }
    }

    /// The mode whose picture will actually reach the screen, read the same way as
    /// [`Self::for_client_audio`] from the source video stream and the set the
    /// client declared. Two things play black on a copy: a codec the device has no
    /// decoder for, and H.264 above 8 bits, which the client declares as
    /// `h26410bit` beside `h264` because no codec name carries a depth. A depth
    /// nothing read is matched on the codec name alone. Only a video copy is
    /// overridden, and never speculatively - a client that declares nothing keeps
    /// its stream copy.
    pub fn for_client_video(
        self,
        codec: Option<&str>,
        bit_depth: Option<u32>,
        client_decodes: Option<&str>,
    ) -> Self {
        match (self.video, client_decodes) {
            (VideoMode::Copy, Some(set)) if !client_can_draw(codec, bit_depth, set) => Self {
                video: VideoMode::H264,
                ..self
            },
            _ => self,
        }
    }

    /// The mode whose picture actually fits the decoder it is going to. A decoder
    /// has a size ceiling as surely as it has a codec list, and no player works
    /// around one: a frame over it either refuses to open or falls to a software
    /// decoder that cannot keep up. `source` is the file's own size and `max`
    /// what the client declared; either absent leaves the mode alone.
    ///
    /// Both axes count. Overrides a copy AND a full-size re-encode, because a
    /// re-encode at the source's size is just as unplayable as the source.
    pub fn for_client_frame(self, source: Option<(u32, u32)>, max: Option<(u32, u32)>) -> Self {
        let (Some(source), Some(max)) = (source, max) else {
            return self;
        };
        if source.0 <= max.0 && source.1 <= max.1 {
            return self;
        }
        Rung::under(max).map_or(self, |rung| Self {
            video: VideoMode::H264At(rung),
            ..self
        })
    }
}

// An unprobed stream is assumed playable: with no codec there is nothing honest
// to override, and forcing a transcode would punish the common case.
fn client_can_play(codec: Option<&str>, client_set: &str) -> bool {
    let Some(codec) = codec else { return true };
    declares(client_set, codec)
}

fn client_can_draw(codec: Option<&str>, bit_depth: Option<u32>, client_set: &str) -> bool {
    let Some(codec) = codec else { return true };
    declares(client_set, declared_as(codec, bit_depth))
}

// HEVC is deliberately absent: its 10-bit profile has no token of its own, so a
// client that cannot draw one declares no `hevc` at all. Adding a token for it
// would hand a NEW client on an OLD server the black picture it declares its way
// out of today.
fn declared_as(codec: &str, bit_depth: Option<u32>) -> &str {
    if codec.eq_ignore_ascii_case(H264) && bit_depth.is_some_and(|depth| depth > 8) {
        H264_10BIT
    } else {
        codec
    }
}

fn declares(client_set: &str, token: &str) -> bool {
    client_set
        .split(',')
        .any(|declared| declared.trim().eq_ignore_ascii_case(token))
}

#[cfg(test)]
mod tests;
