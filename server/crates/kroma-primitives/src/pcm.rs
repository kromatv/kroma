//! Raw PCM: the shape an audio decode writes, and the ffmpeg arguments that write it.

use std::ffi::OsString;
use std::ops::RangeInclusive;
use std::path::Path;

use crate::input;

const SAMPLE_RATES: RangeInclusive<u32> = 8_000..=192_000;
const CHANNELS: RangeInclusive<u8> = 1..=8;

/// How each sample is written: little-endian, interleaved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SampleFormat {
    F32le,
    S16le,
}

impl SampleFormat {
    fn muxer(self) -> &'static str {
        match self {
            Self::F32le => "f32le",
            Self::S16le => "s16le",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pcm {
    pub sample_rate: u32,
    pub channels: u8,
    pub format: SampleFormat,
}

impl Pcm {
    /// Why no decode writes this shape, or `None`: 8 to 192 kHz, 1 to 8 channels.
    pub fn problem(&self) -> Option<String> {
        if !SAMPLE_RATES.contains(&self.sample_rate) {
            return Some(format!(
                "{} Hz is not a sample rate between 8000 and 192000",
                self.sample_rate
            ));
        }
        if !CHANNELS.contains(&self.channels) {
            return Some(format!("{} channels is not between 1 and 8", self.channels));
        }
        None
    }
}

/// The ffmpeg arguments that decode audio track `track` of `source` into `pcm`
/// at `out`, with the input named the one way [`input::file`] allows.
pub fn decode_args(source: &Path, track: u32, pcm: Pcm, out: &Path) -> Vec<OsString> {
    let mut args: Vec<OsString> = ["-v", "error", "-nostdin", "-y"].map(OsString::from).into();
    args.extend(input::file(source));
    args.extend(
        [
            "-vn".to_string(),
            "-map".to_string(),
            format!("0:a:{track}"),
            "-ac".to_string(),
            pcm.channels.to_string(),
            "-ar".to_string(),
            pcm.sample_rate.to_string(),
            "-f".to_string(),
            pcm.format.muxer().to_string(),
        ]
        .map(OsString::from),
    );
    args.push(out.as_os_str().to_os_string());
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    const MONO_16K: Pcm = Pcm {
        sample_rate: 16_000,
        channels: 1,
        format: SampleFormat::F32le,
    };

    fn worded(args: &[OsString]) -> Vec<String> {
        args.iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn a_decode_reads_one_local_audio_track_and_writes_the_shape_asked_for() {
        let source = Path::new("/films/one.mkv");

        let args = decode_args(source, 2, MONO_16K, Path::new("/out/pcm"));

        let named = worded(&input::file(source));
        let (quiet, rest) = args.split_at(4);
        let (input_args, shaped) = rest.split_at(named.len());
        assert_eq!(worded(quiet), ["-v", "error", "-nostdin", "-y"]);
        assert_eq!(worded(input_args), named);
        assert_eq!(
            worded(shaped),
            [
                "-vn", "-map", "0:a:2", "-ac", "1", "-ar", "16000", "-f", "f32le", "/out/pcm",
            ]
        );
    }

    #[test]
    fn sixteen_bit_samples_are_written_by_their_own_muxer() {
        let pcm = Pcm {
            format: SampleFormat::S16le,
            ..MONO_16K
        };

        let args = worded(&decode_args(Path::new("/a.wav"), 0, pcm, Path::new("/b")));

        assert!(
            args.windows(2).any(|pair| pair == ["-f", "s16le"]),
            "{args:?}"
        );
    }

    #[test]
    fn a_shape_outside_what_a_decode_writes_says_why() {
        let too_slow = Pcm {
            sample_rate: 4_000,
            ..MONO_16K
        };
        let too_wide = Pcm {
            channels: 9,
            ..MONO_16K
        };
        let silent = Pcm {
            channels: 0,
            ..MONO_16K
        };

        assert_eq!(MONO_16K.problem(), None);
        assert!(too_slow.problem().unwrap().contains("4000 Hz"));
        assert!(too_wide.problem().unwrap().contains("9 channels"));
        assert!(silent.problem().is_some());
    }
}
