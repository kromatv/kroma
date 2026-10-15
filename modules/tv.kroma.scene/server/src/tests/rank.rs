use std::cmp::Ordering;

use super::*;

fn better(f: &Fixture, a: (&str, Candidate), b: (&str, Candidate)) -> Ordering {
    let a = f.judge_with(a.0, a.1, movie()).unwrap();
    let b = f.judge_with(b.0, b.1, movie()).unwrap();
    rank(&a, &b)
}

#[test]
fn hevc_outranks_h264_at_the_same_quality() {
    let f = fixture();

    let order = better(
        &f,
        ("Movie.2020.1080p.BluRay.x265-GRP", cand(8, 40)),
        ("Movie.2020.1080p.BluRay.x264-GRP", cand(8, 40)),
    );

    assert_eq!(order, Ordering::Greater);
}

#[test]
fn bluray_and_web_dl_share_a_tier_so_hevc_decides() {
    let f = fixture();

    let order = better(
        &f,
        ("Movie.2020.1080p.WEB-DL.x265", cand(8, 40)),
        ("Movie.2020.1080p.BluRay.x264", cand(8, 40)),
    );

    assert_eq!(order, Ordering::Greater);
}

#[test]
fn a_web_dl_outranks_a_webrip() {
    let f = fixture();

    let order = better(
        &f,
        ("Movie.2020.1080p.WEB-DL.x264", cand(6, 10)),
        ("Movie.2020.1080p.WEBRip.x264", cand(6, 10)),
    );

    assert_eq!(order, Ordering::Greater);
}

#[test]
fn the_profile_resolution_outranks_a_lower_one_whatever_its_codec() {
    let f = fixture();

    let order = better(
        &f,
        ("Movie.2020.1080p.WEB-DL.x264", cand(6, 10)),
        ("Movie.2020.720p.BluRay.x265", cand(4, 10)),
    );

    assert_eq!(order, Ordering::Greater);
}

#[test]
fn a_2160p_profile_ranks_2160p_first() {
    let f = fixture_with(LegacySettings {
        resolution: Res::R2160,
        max_gb_movie: 60,
        ..legacy()
    });

    let order = better(
        &f,
        ("Movie.2020.2160p.WEB-DL.x264", cand(20, 10)),
        ("Movie.2020.1080p.BluRay.x265", cand(10, 10)),
    );

    assert_eq!(order, Ordering::Greater);
}

#[test]
fn hdr_outranks_sdr_at_the_same_quality_and_codec() {
    let f = fixture();

    let order = better(
        &f,
        ("Movie.2020.1080p.WEB-DL.DV.x265", cand(6, 10)),
        ("Movie.2020.1080p.WEB-DL.x265", cand(6, 10)),
    );

    assert_eq!(order, Ordering::Greater);
}

#[test]
fn a_proper_outranks_the_release_it_fixes() {
    let f = fixture();

    let order = better(
        &f,
        ("Movie.2020.PROPER.1080p.WEB-DL.x265", cand(6, 10)),
        ("Movie.2020.1080p.WEB-DL.x265", cand(6, 10)),
    );

    assert_eq!(order, Ordering::Greater);
}

#[test]
fn indexer_priority_breaks_a_tie_before_seeders() {
    let f = fixture();
    let preferred = Candidate {
        indexer_priority: 25,
        ..cand(6, 3)
    };

    let order = better(
        &f,
        ("Movie.2020.1080p.WEB-DL.x265", preferred),
        ("Movie.2020.1080p.WEB-DL.x265", cand(6, 300)),
    );

    assert_eq!(order, Ordering::Greater);
}

#[test]
fn many_seeders_outrank_a_few() {
    let f = fixture();

    let order = better(
        &f,
        ("Movie.2020.1080p.WEB-DL.x265", cand(6, 80)),
        ("Movie.2020.1080p.WEB-DL.x265", cand(6, 3)),
    );

    assert_eq!(order, Ordering::Greater);
}

#[test]
fn a_size_near_the_preferred_one_outranks_an_outlier() {
    let f = fixture();

    let order = better(
        &f,
        ("Movie.2020.1080p.WEB-DL.x265", cand(7, 30)),
        ("Movie.2020.1080p.WEB-DL.x265", cand(2, 30)),
    );

    assert_eq!(order, Ordering::Greater);
}

#[test]
fn a_season_pack_outranks_the_same_quality_one_episode_at_a_time() {
    let f = fixture();
    let pack = f
        .judge(
            "Show.S01.1080p.WEB-DL.x265",
            20,
            10,
            Target::Season {
                season: 1,
                episodes: 10,
            },
        )
        .unwrap();
    let single = f
        .judge(
            "Show.S01E01.1080p.WEB-DL.x265",
            2,
            10,
            Target::Episode {
                season: 1,
                episode: 1,
            },
        )
        .unwrap();

    let order = rank(&pack, &single);

    assert_eq!(order, Ordering::Greater);
}
