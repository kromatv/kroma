use std::borrow::Cow;

use serde::Serialize;

use kroma_module_sdk::domain::{ColorInfo, HdrFormat};
use kroma_module_sdk::media::probe::{Chapter, ProbeResult};
use kroma_module_sdk::media::subtitles::is_text_codec;

use crate::downloads::external_subtitles::TorrentSubtitle;

/// Everything ffprobe read of one file, under the keys the catalogue's own
/// streams travel as. Every figure is nullable, and a null is a real answer:
/// the file does not carry it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ProbeView<'a> {
    duration_ms: Option<u64>,
    video: Option<VideoView<'a>>,
    audio: Vec<AudioView<'a>>,
    subtitles: Vec<SubtitleView<'a>>,
    chapters: Vec<ChapterView<'a>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoView<'a> {
    codec: &'a str,
    width: Option<u32>,
    height: Option<u32>,
    hdr: bool,
    bit_depth: Option<u32>,
    hdr_format: Option<&'static str>,
    dolby_vision_profile: Option<u32>,
    color: Option<&'a ColorInfo>,
}

#[derive(Debug, Serialize)]
struct AudioView<'a> {
    index: u32,
    codec: &'a str,
    channels: Option<u32>,
    language: Option<&'a str>,
    title: Option<&'a str>,
    default: bool,
}

#[derive(Debug, Serialize)]
struct SubtitleView<'a> {
    index: usize,
    codec: &'a str,
    language: Option<&'a str>,
    title: Option<Cow<'a, str>>,
    forced: bool,
    text: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChapterView<'a> {
    start_ms: u64,
    end_ms: u64,
    title: Option<&'a str>,
}

impl<'a> ProbeView<'a> {
    /// Everything read of one file, with the subtitle files beside it after its
    /// own tracks. Only the ones that have arrived are listed: the index a
    /// client builds a URL from is a position in this list, so one that could
    /// not be answered yet would move every later track.
    pub(super) fn of(probed: &'a ProbeResult, beside: &'a [TorrentSubtitle]) -> Self {
        let mut view = Self::from(probed);
        let inside = view.subtitles.len();
        view.subtitles
            .extend(
                beside
                    .iter()
                    .filter(|found| found.arrived)
                    .enumerate()
                    .map(|(at, found)| SubtitleView {
                        index: inside + at,
                        codec: found.found.codec,
                        language: found.found.language,
                        title: found.found.title().map(Cow::Owned),
                        forced: found.found.forced,
                        text: true,
                    }),
            );
        view
    }
}

impl<'a> From<&'a ProbeResult> for ProbeView<'a> {
    fn from(probed: &'a ProbeResult) -> Self {
        Self {
            duration_ms: probed.duration_ms,
            video: probed.video.as_ref().map(|v| VideoView {
                codec: &v.codec,
                width: v.width,
                height: v.height,
                hdr: v.hdr,
                bit_depth: v.bit_depth,
                hdr_format: v.hdr_format.map(HdrFormat::as_str),
                dolby_vision_profile: v.dolby_vision_profile,
                color: v.color.as_ref(),
            }),
            audio: probed
                .audio_tracks
                .iter()
                .map(|a| AudioView {
                    index: a.index,
                    codec: &a.codec,
                    channels: a.channels,
                    language: a.language.as_deref(),
                    title: a.title.as_deref(),
                    default: a.default,
                })
                .collect(),
            subtitles: probed
                .subtitles
                .iter()
                .enumerate()
                .map(|(index, s)| SubtitleView {
                    index,
                    codec: &s.codec,
                    language: s.language.as_deref(),
                    title: s.title.as_deref().map(Cow::Borrowed),
                    forced: s.forced,
                    text: is_text_codec(&s.codec),
                })
                .collect(),
            chapters: probed.chapters.iter().map(ChapterView::from).collect(),
        }
    }
}

impl<'a> From<&'a Chapter> for ChapterView<'a> {
    fn from(chapter: &'a Chapter) -> Self {
        Self {
            start_ms: chapter.start_ms,
            end_ms: chapter.end_ms,
            title: chapter.title.as_deref(),
        }
    }
}

#[cfg(test)]
mod tests;
