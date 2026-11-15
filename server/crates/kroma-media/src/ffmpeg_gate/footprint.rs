use kroma_module_wire::VideoStream;

pub(super) const MIB: u64 = 1 << 20;

const DECODER_BASE: u64 = 32 * MIB;
const BYTES_PER_PIXEL: u64 = 24;
const DEEP_BYTES_PER_PIXEL: u64 = 36;
const UNMEASURED_PIXELS: u64 = 3840 * 2160;
const MAX_PIXELS: u64 = 7680 * 4320;

/// The memory one ffmpeg pass is expected to hold at its peak, which the gate
/// weighs against the host's free memory before the pass may start.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Footprint(u64);

impl Footprint {
    /// A pass that decodes no picture: a demux, an audio decode, a sheet of
    /// thumbnails.
    pub const LIGHT: Self = Self(64 * MIB);

    /// A pass that decodes `video`'s pictures one at a time. A stream whose size
    /// or depth nothing measured is sized as 2160p at ten bits.
    pub fn decoding(video: Option<&VideoStream>) -> Self {
        let pixels = video
            .and_then(|video| Some(u64::from(video.width?) * u64::from(video.height?)))
            .unwrap_or(UNMEASURED_PIXELS)
            .min(MAX_PIXELS);
        let per_pixel = match video.and_then(|video| video.bit_depth) {
            Some(depth) if depth <= 8 => BYTES_PER_PIXEL,
            _ => DEEP_BYTES_PER_PIXEL,
        };
        Self(DECODER_BASE + pixels * per_pixel)
    }

    pub fn bytes(self) -> u64 {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stream(width: u32, height: u32, bit_depth: u32) -> VideoStream {
        VideoStream {
            codec: "hevc".to_string(),
            width: Some(width),
            height: Some(height),
            hdr: false,
            bit_depth: Some(bit_depth),
            hdr_format: None,
            dolby_vision_profile: None,
            color: None,
        }
    }

    fn mib(footprint: Footprint) -> u64 {
        footprint.bytes() / MIB
    }

    #[test]
    fn covers_the_peaks_measured_for_one_hevc_keyframe() {
        let measured = [
            (stream(3840, 2160, 10), 291),
            (stream(3840, 2160, 8), 196),
            (stream(1920, 1080, 10), 93),
            (stream(1920, 1080, 8), 69),
            (stream(1280, 720, 10), 56),
        ];

        let short: Vec<_> = measured
            .iter()
            .filter(|(video, peak)| mib(Footprint::decoding(Some(video))) < *peak)
            .collect();

        assert!(short.is_empty(), "under the measured peak: {short:?}");
    }

    #[test]
    fn a_ten_bit_picture_costs_more_than_an_eight_bit_one_of_the_same_size() {
        let eight = Footprint::decoding(Some(&stream(1920, 1080, 8)));

        let ten = Footprint::decoding(Some(&stream(1920, 1080, 10)));

        assert!(ten > eight);
    }

    #[test]
    fn a_stream_nothing_measured_is_sized_as_ten_bit_2160p() {
        let unmeasured = VideoStream {
            width: None,
            height: None,
            bit_depth: None,
            ..stream(0, 0, 0)
        };

        let footprints = [
            Footprint::decoding(None),
            Footprint::decoding(Some(&unmeasured)),
        ];

        assert_eq!(
            footprints,
            [Footprint::decoding(Some(&stream(3840, 2160, 10))); 2]
        );
    }

    #[test]
    fn a_probe_reporting_an_absurd_size_is_held_to_8k() {
        let absurd = Footprint::decoding(Some(&stream(u32::MAX, u32::MAX, 10)));

        assert_eq!(absurd, Footprint::decoding(Some(&stream(7680, 4320, 10))));
    }
}
