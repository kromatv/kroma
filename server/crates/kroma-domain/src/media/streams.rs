//! One track inside a media file: its codec, and for video the HDR variant
//! and colour signalling a client is matched against.

use serde::{Deserialize, Serialize};

/// The HDR system a video stream carries. Absent is SDR. Each has its own client
/// support, so a set that renders HDR10 and a set that also renders Dolby Vision
/// are not the same set.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HdrFormat {
    Hdr10,
    Hdr10Plus,
    DolbyVision,
    Hlg,
}

impl HdrFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            HdrFormat::Hdr10 => "hdr10",
            HdrFormat::Hdr10Plus => "hdr10Plus",
            HdrFormat::DolbyVision => "dolbyVision",
            HdrFormat::Hlg => "hlg",
        }
    }
    pub fn parse(s: &str) -> Option<HdrFormat> {
        match s {
            "hdr10" => Some(HdrFormat::Hdr10),
            "hdr10Plus" => Some(HdrFormat::Hdr10Plus),
            "dolbyVision" => Some(HdrFormat::DolbyVision),
            "hlg" => Some(HdrFormat::Hlg),
            _ => None,
        }
    }
}

/// Colour signalling as the container states it, in ffprobe's own spelling
/// (`bt2020`, `smpte2084`, `bt709`, ...) rather than a normalised one, because a
/// client matches the exact value and a rename would lose what was read.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ColorInfo {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primaries: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transfer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub matrix: Option<String>,
}

impl ColorInfo {
    pub fn is_empty(&self) -> bool {
        self.primaries.is_none() && self.transfer.is_none() && self.matrix.is_none()
    }
}

/// Video stream description (best-effort; fields may be null when unknown).
/// `hdr` is what a client that predates `hdr_format` reads: true for any variant,
/// and still true where the variant itself was never recorded, which is how a row
/// probed before the column existed keeps reading as HDR. So `hdr` without
/// `hdr_format` means "HDR, variant unknown", never SDR.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoStream {
    pub codec: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub hdr: bool,
    #[serde(rename = "bitDepth")]
    pub bit_depth: Option<u32>,
    #[serde(rename = "hdrFormat", default, skip_serializing_if = "Option::is_none")]
    pub hdr_format: Option<HdrFormat>,
    #[serde(
        rename = "dolbyVisionProfile",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub dolby_vision_profile: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<ColorInfo>,
}

/// One audio stream/track. An item can carry several (e.g. EN + FR, or a
/// director's commentary); `index` is the audio-relative position (0-based
/// among audio streams only), matching ffmpeg's `-map 0:a:<index>` selector
/// used when remuxing a chosen track.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioStream {
    #[serde(default)]
    pub index: u32,
    pub codec: String,
    pub channels: Option<u32>,
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default)]
    pub default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleTrack {
    pub language: Option<String>,
    pub codec: String,
}

/// Outcome of the EBU R128 loudness analysis of an audio track.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioVerdict {
    Ok,
    HighDynamics,
    QuietDialog,
}

/// EBU R128 loudness measurement of an item's default audio track, produced by
/// the `pipeline.loudness` stage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioAnalysis {
    #[serde(rename = "lufsI")]
    pub lufs_i: f64,
    // Loudness range (LU); > ~15 is the classic "quiet dialogue, loud
    // explosions" mix.
    pub lra: f64,
    #[serde(rename = "truePeak")]
    pub true_peak: f64,
    // Centre-channel loudness (LUFS), measured for 5.1+ tracks only.
    #[serde(
        rename = "dialogLufs",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub dialog_lufs: Option<f64>,
    pub verdict: AudioVerdict,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_hdr_variant_stores_under_the_spelling_it_travels_as() {
        for variant in [
            HdrFormat::Hdr10,
            HdrFormat::Hdr10Plus,
            HdrFormat::DolbyVision,
            HdrFormat::Hlg,
        ] {
            assert_eq!(
                serde_json::to_string(&variant).unwrap(),
                format!("\"{}\"", variant.as_str())
            );
            assert_eq!(HdrFormat::parse(variant.as_str()), Some(variant));
        }

        assert_eq!(HdrFormat::parse("hdr"), None);
    }

    #[test]
    fn a_stream_with_nothing_to_say_about_colour_is_empty() {
        let said_nothing = ColorInfo::default();
        let said_something = ColorInfo {
            transfer: Some("smpte2084".into()),
            ..ColorInfo::default()
        };

        assert!(said_nothing.is_empty());
        assert!(!said_something.is_empty());
    }
}
