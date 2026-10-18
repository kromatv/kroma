use super::*;

#[test]
fn a_cam_is_a_cam_at_any_resolution() {
    let quality = Quality::of(Some(Source::Cam), Some(Res::R1080));

    assert_eq!(quality, Quality::Cam);
}

#[test]
fn a_dvd_is_always_standard_definition() {
    let quality = Quality::of(Some(Source::Dvd), Some(Res::R720));

    assert_eq!(quality, Quality::Dvd);
}

#[test]
fn a_release_with_no_source_and_no_resolution_is_unknown() {
    assert_eq!(Quality::of(None, None), Quality::Unknown);
}

#[test]
fn a_remux_with_no_resolution_is_a_1080p_remux() {
    let quality = Quality::of(Some(Source::Remux), None);

    assert_eq!(quality, Quality::Remux1080);
}

#[test]
fn a_source_with_no_resolution_is_standard_definition() {
    let quality = Quality::of(Some(Source::WebDl), None);

    assert_eq!(quality, Quality::WebDlSd);
}

#[test]
fn every_source_at_every_resolution_makes_the_quality_that_names_it() {
    let cases = [
        (Res::Sd, None, "unknown-sd"),
        (Res::Sd, Some(Source::Hdtv), "sdtv"),
        (Res::Sd, Some(Source::WebRip), "webrip-sd"),
        (Res::Sd, Some(Source::WebDl), "webdl-sd"),
        (Res::Sd, Some(Source::BluRay), "bluray-sd"),
        (Res::R720, None, "unknown-720p"),
        (Res::R720, Some(Source::Hdtv), "hdtv-720p"),
        (Res::R720, Some(Source::WebRip), "webrip-720p"),
        (Res::R720, Some(Source::WebDl), "webdl-720p"),
        (Res::R720, Some(Source::BluRay), "bluray-720p"),
        (Res::R720, Some(Source::Remux), "bluray-720p"),
        (Res::R1080, None, "unknown-1080p"),
        (Res::R1080, Some(Source::Hdtv), "hdtv-1080p"),
        (Res::R1080, Some(Source::WebRip), "webrip-1080p"),
        (Res::R1080, Some(Source::WebDl), "webdl-1080p"),
        (Res::R1080, Some(Source::BluRay), "bluray-1080p"),
        (Res::R1080, Some(Source::Remux), "remux-1080p"),
        (Res::R2160, None, "unknown-2160p"),
        (Res::R2160, Some(Source::Hdtv), "hdtv-2160p"),
        (Res::R2160, Some(Source::WebRip), "webrip-2160p"),
        (Res::R2160, Some(Source::WebDl), "webdl-2160p"),
        (Res::R2160, Some(Source::BluRay), "bluray-2160p"),
        (Res::R2160, Some(Source::Remux), "remux-2160p"),
    ];

    for (resolution, source, id) in cases {
        assert_eq!(Quality::of(source, Some(resolution)).id(), id);
    }
}

#[test]
fn every_quality_has_a_distinct_id_that_round_trips_through_json() {
    for quality in Quality::ALL {
        let json = serde_json::to_string(&quality).unwrap();

        assert_eq!(json, format!("\"{}\"", quality.id()));
        assert_eq!(serde_json::from_str::<Quality>(&json).unwrap(), quality);
    }
}

#[test]
fn a_quality_names_the_resolution_it_is_at() {
    let resolutions: Vec<Option<Res>> = Quality::ALL.iter().map(|q| q.resolution()).collect();

    assert_eq!(resolutions[0], None);
    assert_eq!(resolutions[1], None);
    assert_eq!(Quality::Dvd.resolution(), Some(Res::Sd));
    assert_eq!(Quality::Hdtv720.resolution(), Some(Res::R720));
    assert_eq!(Quality::Remux1080.resolution(), Some(Res::R1080));
    assert_eq!(Quality::Remux2160.resolution(), Some(Res::R2160));
    assert_eq!(resolutions.iter().flatten().count(), 23);
}

#[test]
fn a_picture_with_no_size_has_no_resolution() {
    assert_eq!(Res::from_dimensions(None, None), None);
}

#[test]
fn a_picture_is_placed_by_its_width_before_its_height() {
    assert_eq!(
        Res::from_dimensions(Some(3840), Some(1600)),
        Some(Res::R2160)
    );
    assert_eq!(
        Res::from_dimensions(Some(1920), Some(800)),
        Some(Res::R1080)
    );
    assert_eq!(Res::from_dimensions(Some(1280), Some(536)), Some(Res::R720));
    assert_eq!(Res::from_dimensions(Some(720), Some(480)), Some(Res::Sd));
}

#[test]
fn a_picture_with_only_a_height_is_placed_by_it() {
    assert_eq!(Res::from_dimensions(None, Some(2160)), Some(Res::R2160));
    assert_eq!(Res::from_dimensions(None, Some(1080)), Some(Res::R1080));
    assert_eq!(Res::from_dimensions(None, Some(720)), Some(Res::R720));
}
