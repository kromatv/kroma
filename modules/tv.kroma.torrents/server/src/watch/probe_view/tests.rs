use super::*;

use serde_json::json;

use kroma_module_sdk::domain::{AudioStream, SubtitleTrack, VideoStream};
use kroma_module_sdk::media::external_subtitles::ExternalSubtitle;

fn sintel() -> ProbeResult {
    ProbeResult {
        duration_ms: Some(888_064),
        video: Some(VideoStream {
            codec: "h264".into(),
            width: Some(1920),
            height: Some(1080),
            hdr: false,
            bit_depth: Some(8),
            hdr_format: None,
            dolby_vision_profile: None,
            color: None,
        }),
        audio_tracks: vec![AudioStream {
            index: 0,
            codec: "ac3".into(),
            channels: Some(6),
            language: Some("eng".into()),
            title: Some("Commentary: Ton Roosendaal".into()),
            default: false,
        }],
        subtitles: vec![SubtitleTrack {
            language: Some("fra".into()),
            codec: "subrip".into(),
            title: None,
            forced: false,
        }],
        chapters: vec![Chapter {
            start_ms: 0,
            end_ms: 120_000,
            title: Some("Opening".into()),
        }],
        ..ProbeResult::default()
    }
}

#[test]
fn a_probe_crosses_under_the_keys_a_client_reads() {
    let view = serde_json::to_value(ProbeView::from(&sintel())).unwrap();

    assert_eq!(
        view,
        json!({
            "durationMs": 888_064,
            "video": {
                "codec": "h264", "width": 1920, "height": 1080, "hdr": false,
                "bitDepth": 8, "hdrFormat": null, "dolbyVisionProfile": null, "color": null,
            },
            "audio": [{
                "index": 0, "codec": "ac3", "channels": 6, "language": "eng",
                "title": "Commentary: Ton Roosendaal", "default": false,
            }],
            "subtitles": [{
                "index": 0, "codec": "subrip", "language": "fra", "title": null,
                "forced": false, "text": true,
            }],
            "chapters": [{ "startMs": 0, "endMs": 120_000, "title": "Opening" }],
        })
    );
}

#[test]
fn a_file_with_no_picture_and_no_length_crosses_as_nulls() {
    let view = serde_json::to_value(ProbeView::from(&ProbeResult::default())).unwrap();

    assert_eq!(
        view,
        json!({
            "durationMs": null, "video": null, "audio": [],
            "subtitles": [], "chapters": [],
        })
    );
}

#[test]
fn a_figure_ffprobe_did_not_report_crosses_as_a_null_rather_than_a_zero() {
    let probed = ProbeResult {
        video: Some(VideoStream {
            width: None,
            height: None,
            bit_depth: None,
            ..sintel().video.unwrap()
        }),
        audio_tracks: vec![AudioStream {
            channels: None,
            language: None,
            title: None,
            ..sintel().audio_tracks.remove(0)
        }],
        ..ProbeResult::default()
    };

    let view = serde_json::to_value(ProbeView::from(&probed)).unwrap();

    assert_eq!(view["video"]["width"], json!(null));
    assert_eq!(view["video"]["bitDepth"], json!(null));
    assert_eq!(view["audio"][0]["language"], json!(null));
    assert_eq!(view["audio"][0]["title"], json!(null));
}

#[test]
fn a_high_dynamic_range_picture_names_its_system_the_way_the_catalogue_does() {
    let probed = ProbeResult {
        video: Some(VideoStream {
            hdr: true,
            bit_depth: Some(10),
            hdr_format: Some(HdrFormat::DolbyVision),
            dolby_vision_profile: Some(5),
            color: Some(ColorInfo {
                primaries: Some("bt2020".into()),
                transfer: Some("smpte2084".into()),
                matrix: Some("bt2020nc".into()),
            }),
            ..sintel().video.unwrap()
        }),
        ..ProbeResult::default()
    };

    let view = serde_json::to_value(ProbeView::from(&probed)).unwrap();

    assert_eq!(
        view["video"],
        json!({
            "codec": "h264", "width": 1920, "height": 1080, "hdr": true, "bitDepth": 10,
            "hdrFormat": "dolbyVision", "dolbyVisionProfile": 5,
            "color": { "primaries": "bt2020", "transfer": "smpte2084", "matrix": "bt2020nc" },
        })
    );
}

#[test]
fn a_picture_subtitle_crosses_as_one_no_player_can_render_as_text() {
    let probed = ProbeResult {
        subtitles: vec![
            SubtitleTrack {
                language: Some("eng".into()),
                codec: "ass".into(),
                title: Some("Dialogue".into()),
                forced: true,
            },
            SubtitleTrack {
                language: None,
                codec: "pgs".into(),
                title: None,
                forced: false,
            },
        ],
        ..ProbeResult::default()
    };

    let view = serde_json::to_value(ProbeView::from(&probed)).unwrap();

    assert_eq!(
        view["subtitles"],
        json!([
            { "index": 0, "codec": "ass", "language": "eng", "title": "Dialogue", "forced": true, "text": true },
            { "index": 1, "codec": "pgs", "language": null, "title": null, "forced": false, "text": false },
        ])
    );
}

fn beside_it(name: &str, language: &'static str, arrived: bool) -> TorrentSubtitle {
    TorrentSubtitle {
        file_index: 4,
        found: ExternalSubtitle {
            path: std::path::PathBuf::from(name),
            language: Some(language),
            forced: false,
            hearing_impaired: false,
            codec: "subrip",
        },
        arrived,
    }
}

#[test]
fn a_subtitle_file_beside_the_video_is_listed_after_the_tracks_inside_it() {
    let beside = [beside_it("Sintel.en.srt", "en", true)];

    let view = serde_json::to_value(ProbeView::of(&sintel(), &beside)).unwrap();

    assert_eq!(
        view["subtitles"],
        json!([
            { "index": 0, "codec": "subrip", "language": "fra", "title": null, "forced": false, "text": true },
            { "index": 1, "codec": "subrip", "language": "en", "title": null, "forced": false, "text": true },
        ])
    );
}

#[test]
fn a_subtitle_file_that_has_not_arrived_is_not_listed_yet() {
    let beside = [
        beside_it("Sintel.en.srt", "en", false),
        beside_it("Sintel.de.srt", "de", true),
    ];

    let view = serde_json::to_value(ProbeView::of(&sintel(), &beside)).unwrap();

    assert_eq!(view["subtitles"].as_array().map(Vec::len), Some(2));
    assert_eq!(view["subtitles"][1]["language"], json!("de"));
}
