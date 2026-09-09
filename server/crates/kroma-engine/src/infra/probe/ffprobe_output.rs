//! ffprobe's `-of json` output as types. Every field is optional because every
//! field is absent for some container, and the spellings are ffprobe's own.

use serde::Deserialize;

// ffprobe spells the Dolby Vision record "DOVI configuration record".
const DOVI: &str = "DOVI configuration record";

#[derive(Debug, Deserialize)]
pub(super) struct FfprobeOutput {
    #[serde(default)]
    pub(super) streams: Vec<FfStream>,
    #[serde(default)]
    pub(super) format: Option<FfFormat>,
    #[serde(default)]
    pub(super) chapters: Vec<FfChapter>,
}

#[derive(Debug, Deserialize)]
pub(super) struct FfFormat {
    pub(super) duration: Option<String>,
}

// `start_time`/`end_time` are seconds, as strings.
#[derive(Debug, Deserialize)]
pub(super) struct FfChapter {
    pub(super) start_time: Option<String>,
    pub(super) end_time: Option<String>,
    #[serde(default)]
    pub(super) tags: Option<FfChapterTags>,
}

#[derive(Debug, Deserialize)]
pub(super) struct FfChapterTags {
    pub(super) title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct FfStream {
    pub(super) codec_type: Option<String>,
    pub(super) codec_name: Option<String>,
    pub(super) width: Option<u32>,
    pub(super) height: Option<u32>,
    pub(super) channels: Option<u32>,
    pub(super) pix_fmt: Option<String>,
    pub(super) color_transfer: Option<String>,
    pub(super) color_primaries: Option<String>,
    // ffprobe's name for the matrix coefficients.
    pub(super) color_space: Option<String>,
    pub(super) bits_per_raw_sample: Option<String>,
    #[serde(default)]
    pub(super) tags: Option<FfTags>,
    #[serde(default)]
    pub(super) disposition: Option<FfDisposition>,
    #[serde(default)]
    pub(super) side_data_list: Vec<FfSideData>,
}

#[derive(Debug, Deserialize)]
pub(super) struct FfSideData {
    pub(super) side_data_type: Option<String>,
    pub(super) dv_profile: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub(super) struct FfTags {
    pub(super) language: Option<String>,
    pub(super) title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct FfDisposition {
    pub(super) default: Option<u8>,
}

impl FfStream {
    pub(super) fn dovi(&self) -> Option<&FfSideData> {
        self.side_data_list
            .iter()
            .find(|d| d.side_data_type.as_deref() == Some(DOVI))
    }

    pub(super) fn language(&self) -> Option<String> {
        self.tags
            .as_ref()
            .and_then(|t| t.language.clone())
            .filter(|l| !l.is_empty() && l != "und")
    }

    pub(super) fn title(&self) -> Option<String> {
        self.tags
            .as_ref()
            .and_then(|t| t.title.clone())
            .filter(|t| !t.trim().is_empty())
    }
}
