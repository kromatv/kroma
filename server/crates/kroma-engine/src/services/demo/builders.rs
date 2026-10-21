use crate::model::{
    AudioStream, ColorInfo, HdrFormat, Kind, MediaFile, MediaItem, SubtitleTrack, VideoStream,
};
use crate::services::scan::short_hash;

pub(super) fn demo_file(item: &MediaItem) -> MediaFile {
    let fid = short_hash(&format!("{}|file", item.id));
    MediaFile {
        id: fid.clone(),
        rel_path: item.rel_path.clone(),
        container: item.container.clone(),
        duration_ms: item.duration_ms,
        video: item.video.clone(),
        audio: item.audio.clone(),
        audio_tracks: item.audio_tracks.clone(),
        subtitles: item.subtitles.clone(),
        size: None,
        edition: None,
        probed: true,
        unreadable: None,
        edition_id: None,
        // No real path on disk; a synthetic URI satisfies the DB's NOT NULL
        // UNIQUE `abs_path` column. Can't be streamed, matching demo behaviour.
        abs_path: Some(format!("demo://{fid}")),
    }
}

pub(super) fn with_demo_file(mut item: MediaItem) -> MediaItem {
    let file = demo_file(&item);
    item.default_file_id = Some(file.id.clone());
    item.files = vec![file];
    item
}

pub(super) fn show_id(lib: &str, title: &str) -> String {
    short_hash(&format!("{lib}|show|{}", title.to_lowercase()))
}

#[allow(clippy::too_many_arguments)]
pub(super) fn movie(
    seed: &str,
    title: &str,
    year: Option<u32>,
    duration_ms: Option<u64>,
    container: &str,
    video: Option<VideoStream>,
    audio_tracks: Vec<AudioStream>,
    subtitles: Vec<SubtitleTrack>,
    library: &str,
    added_at: &str,
) -> MediaItem {
    let audio_tracks = tracks(audio_tracks);
    with_demo_file(MediaItem {
        id: short_hash(seed),
        title: title.into(),
        kind: Kind::Movie,
        year,
        duration_ms,
        container: container.into(),
        video,
        audio: audio_tracks.first().cloned(),
        audio_tracks,
        subtitles,
        library: library.into(),
        show_id: None,
        show_title: None,
        season: None,
        episode: None,
        episode_end: None,
        episode_title: None,
        rel_path: None,
        added_at: added_at.into(),
        metadata: None,
        abs_path: None,
        files: Vec::new(),
        editions: Vec::new(),
        default_file_id: None,
        markers: Vec::new(),
        audio_analysis: None,
    })
}

#[allow(clippy::too_many_arguments)]
pub(super) fn episode(
    seed: &str,
    show: &str,
    show_title: &str,
    season: u32,
    episode: u32,
    episode_title: &str,
    year: Option<u32>,
    duration_ms: Option<u64>,
    container: &str,
    video: Option<VideoStream>,
    audio_tracks: Vec<AudioStream>,
    library: &str,
    added_at: &str,
) -> MediaItem {
    let audio_tracks = tracks(audio_tracks);
    with_demo_file(MediaItem {
        id: short_hash(seed),
        title: episode_title.into(),
        kind: Kind::Episode,
        year,
        duration_ms,
        container: container.into(),
        video,
        audio: audio_tracks.first().cloned(),
        audio_tracks,
        subtitles: vec![sub(Some("eng"), "subrip")],
        library: library.into(),
        show_id: Some(show.into()),
        show_title: Some(show_title.into()),
        season: Some(season),
        episode: Some(episode),
        episode_end: None,
        episode_title: Some(episode_title.into()),
        rel_path: None,
        added_at: added_at.into(),
        metadata: None,
        abs_path: None,
        files: Vec::new(),
        editions: Vec::new(),
        default_file_id: None,
        markers: Vec::new(),
        audio_analysis: None,
    })
}

pub(super) fn video(
    codec: &str,
    width: u32,
    height: u32,
    hdr_format: Option<HdrFormat>,
    bit_depth: u32,
) -> Option<VideoStream> {
    Some(VideoStream {
        codec: codec.into(),
        width: Some(width),
        height: Some(height),
        hdr: hdr_format.is_some(),
        bit_depth: Some(bit_depth),
        hdr_format,
        dolby_vision_profile: None,
        color: Some(demo_color(hdr_format)),
    })
}

// What a probe of the generated file would read back: the HDR titles really are
// encoded PQ / bt2020 (see `demo::media`), so the colour columns must agree.
fn demo_color(hdr_format: Option<HdrFormat>) -> ColorInfo {
    let (primaries, transfer, matrix) = match hdr_format {
        Some(_) => ("bt2020", "smpte2084", "bt2020nc"),
        None => ("bt709", "bt709", "bt709"),
    };
    ColorInfo {
        primaries: Some(primaries.into()),
        transfer: Some(transfer.into()),
        matrix: Some(matrix.into()),
    }
}

pub(super) fn audio(codec: &str, channels: u32, language: Option<&str>) -> AudioStream {
    AudioStream {
        index: 0,
        codec: codec.into(),
        channels: Some(channels),
        language: language.map(Into::into),
        title: None,
        default: false,
        region: None,
    }
}

pub(super) fn tracks(list: Vec<AudioStream>) -> Vec<AudioStream> {
    list.into_iter()
        .enumerate()
        .map(|(i, mut a)| {
            a.index = i as u32;
            a.default = i == 0;
            a
        })
        .collect()
}

pub(super) fn sub(language: Option<&str>, codec: &str) -> SubtitleTrack {
    SubtitleTrack {
        language: language.map(Into::into),
        codec: codec.into(),
        title: None,
        forced: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracks_helper_assigns_sequential_indices() {
        let out = tracks(vec![
            audio("eac3", 6, Some("eng")),
            audio("aac", 2, Some("fra")),
        ]);
        assert_eq!(out[0].index, 0);
        assert!(out[0].default);
        assert_eq!(out[1].index, 1);
        assert!(!out[1].default);
    }

    #[test]
    fn show_id_is_deterministic_and_case_insensitive() {
        assert_eq!(show_id("lib", "The Office"), show_id("lib", "the office"));
        assert_ne!(show_id("lib", "The Office"), show_id("other", "The Office"));
    }

    #[test]
    fn video_and_sub_helpers() {
        let v = video("hevc", 3840, 2160, Some(HdrFormat::Hdr10), 10).unwrap();
        assert_eq!(v.codec, "hevc");
        assert_eq!(v.width, Some(3840));
        assert!(v.hdr);
        let s = sub(Some("fra"), "subrip");
        assert_eq!(s.language.as_deref(), Some("fra"));
        assert_eq!(s.codec, "subrip");
    }
}
