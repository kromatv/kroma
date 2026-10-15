//! Which candidate a watch settles on, and what it says when every one of
//! them is refused.

use std::collections::HashMap;

use serde_json::json;

use super::super::test_support::{archive_hits, big_buck_bunny, dune, found, holding, severance_s01e02, sintel, watched, Peers};

#[tokio::test(flavor = "multi_thread")]
async fn a_sweep_where_nothing_can_be_played_names_the_rules_that_refused_it() {
    let peers = found(&[
        ("Dune.2021.2160p.BluRay.x265", 60),
        ("Dune.2021.1080p.WEB.x264", 40),
        ("Dune.2021.1080p.HDCAM.x264", 2),
    ]);

    let err = watched(&peers, dune()).await.unwrap_err();

    assert_eq!(
        err.to_string(),
        "found 3 releases, none can be watched: too-big (2), cam-source (1)"
    );
    assert!(peers.grabbed().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn an_archive_name_stating_no_resolution_is_started_rather_than_refused() {
    let peers = archive_hits(&[
        ("Sintel (2010)", 566_514_982),
        ("Sintel Trailer", 25_920_544),
    ]);

    let reply = watched(&peers, sintel()).await.unwrap();

    assert_eq!(reply.release, "Sintel (2010)");
    assert!(!reply.reused);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_name_carrying_a_disc_is_ranked_behind_the_film_it_outweighs() {
    let peers = archive_hits(&[
        ("Big Buck Bunny (2008) German Blu-ray Disc", 8_893_827_382),
        ("Big Buck Bunny (2008)", 209_056_706),
    ]);

    let reply = watched(&peers, big_buck_bunny()).await.unwrap();

    assert_eq!(reply.release, "Big Buck Bunny (2008)");
    assert!(peers.removed().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_started_release_holding_a_disc_image_is_taken_back_off_for_the_next_candidate() {
    let peers = Peers {
        contents: HashMap::from([(
            "Sintel (2010) Blu-ray".to_string(),
            holding(&[("SINTEL_BD.iso", 8_474_263_552), ("SINTEL_BD.md5", 55)]),
        )]),
        ..archive_hits(&[
            ("Sintel (2010) Blu-ray", 8_474_263_552),
            ("Sintel (2010)", 566_514_982),
        ])
    };

    let reply = watched(&peers, sintel()).await.unwrap();

    assert_eq!(reply.release, "Sintel (2010)");
    assert_eq!(peers.removed(), ["Sintel (2010) Blu-ray"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_watch_whose_every_candidate_holds_no_film_says_what_they_held() {
    let peers = Peers {
        contents: HashMap::from([
            (
                "Sintel (2010) Blu-ray".to_string(),
                holding(&[("SINTEL_BD.iso", 8_474_263_552)]),
            ),
            (
                "Sintel (2010)".to_string(),
                holding(&[("sintel.part1.rar", 400_000_000)]),
            ),
        ]),
        ..archive_hits(&[
            ("Sintel (2010) Blu-ray", 8_474_263_552),
            ("Sintel (2010)", 566_514_982),
        ])
    };

    let err = watched(&peers, sintel()).await.unwrap_err();

    assert_eq!(
        err.to_string(),
        "tried 2 releases, none offers a film to play while it arrives: a disc rather than a film, an archive rather than a film"
    );
    assert_eq!(peers.removed(), ["Sintel (2010) Blu-ray", "Sintel (2010)"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_release_the_engine_refuses_lets_the_next_candidate_be_tried() {
    let peers = Peers {
        refusals: HashMap::from([(
            "Sintel (2010) Blu-ray".to_string(),
            "already in the queue (imported)".to_string(),
        )]),
        ..archive_hits(&[
            ("Sintel (2010) Blu-ray", 8_474_263_552),
            ("Sintel (2010)", 566_514_982),
        ])
    };

    let reply = watched(&peers, sintel()).await.unwrap();

    assert_eq!(reply.release, "Sintel (2010)");
    assert!(peers.removed().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_watch_the_engine_refused_every_time_says_what_it_refused_with() {
    let peers = Peers {
        refusals: HashMap::from([
            (
                "Sintel (2010) Blu-ray".to_string(),
                "already in the queue (imported)".to_string(),
            ),
            (
                "Sintel (2010)".to_string(),
                "the kill switch is on".to_string(),
            ),
        ]),
        ..archive_hits(&[
            ("Sintel (2010) Blu-ray", 8_474_263_552),
            ("Sintel (2010)", 566_514_982),
        ])
    };

    let err = watched(&peers, sintel()).await.unwrap_err();

    assert!(
        err.to_string().contains("already in the queue (imported)"),
        "{err}"
    );
    assert!(err.to_string().contains("the kill switch is on"), "{err}");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_release_naming_its_resolution_still_wins_over_one_that_does_not() {
    let peers = archive_hits(&[
        ("Sintel (2010)", 4_530_929_677),
        ("Sintel.2010.1080p.WEB-DL.x264", 1_265_786_839),
    ]);

    let reply = watched(&peers, sintel()).await.unwrap();

    assert_eq!(reply.release, "Sintel.2010.1080p.WEB-DL.x264");
}

#[tokio::test(flavor = "multi_thread")]
async fn the_1080p_x264_dune_is_grabbed_on_the_embedded_engine_from_its_torrent_link() {
    let found: [(&str, u32, u64); 5] = [
        (
            "Dune.2021.MULTI.VFF.2160p.4KLight.HDR10.WebRip.x265.E-AC3.Atmos-BONBON.FRENCH",
            755,
            49,
        ),
        (
            "Dune.2021.MULTI.VFF.1080p.10bit.WEBRip.6CH.x265.HEVC-FERVEX.FRENCH",
            334,
            17,
        ),
        (
            "Dune.2021.MULTI.VFF.1080p.BluRay.Opus.AV1-H4KIG.FRENCH",
            25,
            32,
        ),
        ("Dune.2021.MULTi.VF2.1080p.WEB.x264-FW", 20, 58),
        (
            "Dune.Part.One.2021.HYBRiD.MULTi.VF2.4K.UHD.BluRay.REMUX",
            28,
            818,
        ),
    ];
    let peers = Peers {
        releases: found
            .iter()
            .map(|(title, seeders, tenths_of_gib)| {
                json!({
                    "title": title,
                    "guid": title,
                    "magnet": "magnet:?xt=urn:btih:ab",
                    "link": format!("http://indexer/{title}.torrent"),
                    "seeders": seeders,
                    "size_bytes": tenths_of_gib * 1_073_741_824 / 10,
                })
            })
            .collect(),
        ..Peers::default()
    };

    let reply = watched(&peers, dune()).await.unwrap();

    let grabbed = peers.grabbed();
    assert!(!reply.reused);
    assert_eq!(reply.release, "Dune.2021.MULTi.VF2.1080p.WEB.x264-FW");
    assert_eq!(grabbed[0]["client_id"], "embedded");
    assert_eq!(grabbed[0]["ephemeral"], true);
    assert_eq!(
        grabbed[0]["magnet_or_url"],
        "http://indexer/Dune.2021.MULTi.VF2.1080p.WEB.x264-FW.torrent"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn an_episode_is_grabbed_before_the_season_pack_that_holds_it() {
    let peers = found(&[
        ("Severance.S01.1080p.WEB.x264-GRP", 20),
        ("Severance.S01E02.1080p.WEB.x264-GRP", 2),
    ]);

    let reply = watched(&peers, severance_s01e02()).await.unwrap();

    let grabbed = &peers.grabbed()[0];
    assert_eq!(reply.release, "Severance.S01E02.1080p.WEB.x264-GRP");
    assert_eq!(
        (&grabbed["kind"], &grabbed["season"], &grabbed["episodes"]),
        (&json!("episode"), &json!(1), &json!([2]))
    );
    assert_eq!(
        (
            &peers.looked_up()[0]["season"],
            &peers.looked_up()[0]["episode"]
        ),
        (&json!(1), &json!(2))
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_season_pack_is_grabbed_when_the_episode_has_no_release_of_its_own() {
    let peers = found(&[("Severance.S01.1080p.WEB.x264-GRP", 20)]);

    let reply = watched(&peers, severance_s01e02()).await.unwrap();

    assert_eq!(reply.release, "Severance.S01.1080p.WEB.x264-GRP");
    assert_eq!(peers.grabbed()[0]["kind"], "season");
}
