//! The per-axis [`ScoreLine`]s a score is built from, pinned one axis at a time
//! so a change to the table is a change to one test.

use super::*;

#[test]
fn resolution_delta_matrix() {
    let t = Target::Movie { year: None };
    let mut pr = profile();

    // Preference 1080, got 2160: above preference, +100.
    pr.resolution = Res::R1080;
    let up = "Movie.2020.2160p.WEB-DL.x264";
    assert_eq!(
        res_delta(&score(&p(up), &cand(2, 10), &t, &pr, up).unwrap()),
        100
    );

    // Preference 2160, got 1080: the upgrade path, +400.
    pr.resolution = Res::R2160;
    let mid = "Movie.2020.1080p.WEB-DL.x264";
    assert_eq!(
        res_delta(&score(&p(mid), &cand(2, 10), &t, &pr, mid).unwrap()),
        400
    );

    // Preference 2160, got 720: +50.
    let low = "Movie.2020.720p.WEB-DL.x264";
    assert_eq!(
        res_delta(&score(&p(low), &cand(2, 10), &t, &pr, low).unwrap()),
        50
    );

    // Preference 720, got 1080: fallthrough above-preference, +100.
    pr.resolution = Res::R720;
    assert_eq!(
        res_delta(&score(&p(mid), &cand(2, 10), &t, &pr, mid).unwrap()),
        100
    );

    // Exact match: +1000.
    assert_eq!(
        res_delta(&score(&p(low), &cand(2, 10), &t, &pr, low).unwrap()),
        1000
    );
}

#[test]
fn codec_and_source_score_lines() {
    let t = Target::Movie { year: None };
    let mut pr = profile();

    pr.prefer_hevc = false;
    let hevc = "Movie.2020.1080p.WEB-DL.x265";
    assert_eq!(
        line(
            &score(&p(hevc), &cand(2, 10), &t, &pr, hevc).unwrap(),
            "codec"
        ),
        Some(100)
    );

    let av1 = "Movie.2020.1080p.WEB-DL.AV1";
    assert_eq!(
        line(
            &score(&p(av1), &cand(2, 10), &t, &pr, av1).unwrap(),
            "codec"
        ),
        Some(150)
    );

    // H264: no codec line at all.
    let h264 = "Movie.2020.1080p.WEB-DL.x264";
    assert_eq!(
        line(
            &score(&p(h264), &cand(2, 10), &t, &pr, h264).unwrap(),
            "codec"
        ),
        None
    );

    // Remux source: +250.
    let remux = "Movie.2020.1080p.BluRay.REMUX.x265";
    assert_eq!(
        line(
            &score(&p(remux), &cand(2, 10), &t, &pr, remux).unwrap(),
            "source"
        ),
        Some(250)
    );

    // HDTV source: +25.
    let hdtv = "Movie.2020.1080p.HDTV.x264";
    assert_eq!(
        line(
            &score(&p(hdtv), &cand(2, 10), &t, &pr, hdtv).unwrap(),
            "source"
        ),
        Some(25)
    );
}

#[test]
fn size_sweet_spot_and_proper_lines() {
    let t = Target::Movie { year: None };
    let pr = profile();
    // 8 GB sits in [15/4, 15*3/4] GB, earning the sweet-spot bonus; PROPER too.
    let name = "Movie.2020.PROPER.1080p.BluRay.x265";
    let s = score(&p(name), &cand(8, 10), &t, &pr, name).unwrap();
    assert_eq!(line(&s, "size"), Some(100));
    assert_eq!(line(&s, "proper"), Some(50));
    // A tiny release is below the sweet-spot floor: no size line.
    let tiny = score(&p(name), &cand(1, 10), &t, &pr, name).unwrap();
    assert_eq!(line(&tiny, "size"), None);
}

#[test]
fn a_profile_with_no_size_ceiling_lets_any_release_through() {
    let t = Target::Movie { year: None };
    let pr = Profile {
        max_size_bytes_movie: 0,
        ..profile()
    };
    let name = "Movie.2020.1080p.BluRay.REMUX.x265";

    let s = score(&p(name), &cand(200, 10), &t, &pr, name).unwrap();

    assert_eq!(line(&s, "size"), None);
    assert_eq!(line(&s, "source"), Some(250));
}
