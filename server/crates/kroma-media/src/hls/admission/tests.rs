use super::super::session::testing::{keys, registry, seed, LIVE};
use super::super::{AudioMode, Asked, Rung, StreamMode, VideoMode};
use super::*;

const TRANSCODE: &str = "itA:h264-1080-copy:0:a0";
const OTHER_TRANSCODE: &str = "itB:h264-720-aac:0:a0";
const LEFT_BEHIND: Duration = Duration::from_secs(SUPERSEDED_TRANSCODE_GRACE.as_secs() + 2);
const VIEWER: &str = "dev-1";
const ANOTHER_VIEWER: &str = "dev-2";

async fn registry_allowing(
    name: &str,
    transcodes: usize,
    sessions: &[(&str, Duration)],
) -> (Sessions, kroma_testing::TempDir) {
    let (mut s, dir) = registry(name, 8, sessions).await;
    s.transcode_cap = transcodes;
    (s, dir)
}

async fn supersede(s: &Sessions, key: &str) {
    s.inner.lock().await.get(key).expect("seeded").supersede();
}

async fn sweep(s: &Sessions) {
    let mut map = s.inner.lock().await;
    s.reclaim_superseded(&mut map).await;
}

async fn admits(s: &Sessions) -> bool {
    let mut map = s.inner.lock().await;
    s.admits_transcode(&mut map).await
}

async fn retires_then_admits(s: &Sessions, key: &str, opener: &str) -> bool {
    let mut map = s.inner.lock().await;
    s.reap_superseded(&mut map, key, Some(opener)).await;
    s.admits_transcode(&mut map).await
}

#[tokio::test]
async fn one_viewer_seeking_twice_is_admitted_each_time_and_leaves_one_decode() {
    let (s, _dir) = registry_allowing("admit-seeking", 1, &[]).await;
    seed(&s, "itA:h264-1080-copy:0:a0", LIVE, Some(VIEWER)).await;

    let first = retires_then_admits(&s, "itA:h264-1080-copy:2700:a0", VIEWER).await;
    seed(&s, "itA:h264-1080-copy:2700:a0", LIVE, Some(VIEWER)).await;
    let second = retires_then_admits(&s, "itA:h264-1080-copy:2808:a0", VIEWER).await;
    seed(&s, "itA:h264-1080-copy:2808:a0", LIVE, Some(VIEWER)).await;

    assert!(first && second);
    assert_eq!(keys(&s).await, ["itA:h264-1080-copy:2808:a0"]);
}

#[tokio::test]
async fn a_sibling_another_viewer_opened_holds_its_slot_at_the_ceiling() {
    let (s, _dir) = registry_allowing("admit-sibling", 1, &[]).await;
    seed(&s, "itA:h264-1080-copy:0:a0", LIVE, Some(ANOTHER_VIEWER)).await;

    let admitted = retires_then_admits(&s, "itA:h264-1080-copy:2700:a0", VIEWER).await;

    assert!(!admitted);
    assert_eq!(keys(&s).await, ["itA:h264-1080-copy:0:a0"]);
}

#[tokio::test]
async fn a_caller_that_presented_no_credential_takes_nobody_elses_stream() {
    let (s, _dir) = registry_allowing("admit-anon", 8, &[]).await;
    seed(&s, "itA:h264-1080-copy:0:a0", LIVE, None).await;
    let mut map = s.inner.lock().await;

    s.reap_superseded(&mut map, "itA:h264-1080-copy:2700:a0", None)
        .await;

    assert_eq!(map.len(), 1);
}

#[tokio::test(start_paused = true)]
async fn the_sweep_a_seek_asks_for_lands_without_waiting_for_the_reaper() {
    let (s, _dir) = registry_allowing("admit-later", 2, &[(TRANSCODE, LEFT_BEHIND)]).await;
    supersede(&s, TRANSCODE).await;
    let s = Arc::new(s);

    s.reclaim_superseded_later();
    tokio::time::sleep(SUPERSEDED_TRANSCODE_GRACE * 2).await;

    assert!(keys(&s).await.is_empty());
}

#[tokio::test]
async fn a_host_with_no_slot_left_refuses_a_master_before_it_spawns_anything() {
    let (mut s, dir) = registry("admit-refused", 8, &[(TRANSCODE, LIVE)]).await;
    s.transcode_cap = 1;
    let s = Arc::new(s);
    let input = dir.path().join("never-opened.mkv");
    let asked = Asked {
        item_id: "itB",
        input: input.to_str().expect("a path"),
        opener: Some(VIEWER),
        audio: 0,
        mode: StreamMode::new(VideoMode::H264At(Rung::P1080), AudioMode::Copy),
        anchor: 0,
        source: None,
    };

    let answer = s.master("itB:h264-1080-copy:0:a0", &asked).await;

    assert_eq!(answer.err(), Some(Refusal::Busy));
    assert!(!input.exists(), "nothing read the file it was refused for");
}

#[tokio::test]
async fn a_re_encode_the_viewer_seeked_away_from_is_taken_back_a_grace_later() {
    let (s, _dir) = registry_allowing("admit-left", 2, &[(TRANSCODE, LEFT_BEHIND)]).await;
    supersede(&s, TRANSCODE).await;

    sweep(&s).await;

    assert!(keys(&s).await.is_empty());
}

#[tokio::test]
async fn a_superseded_re_encode_someone_is_still_reading_is_left_alone() {
    let (s, _dir) = registry_allowing("admit-read", 2, &[(TRANSCODE, LIVE)]).await;
    supersede(&s, TRANSCODE).await;

    sweep(&s).await;

    assert_eq!(keys(&s).await, [TRANSCODE]);
}

#[tokio::test]
async fn a_superseded_stream_copy_keeps_the_longer_grace_this_sweep_never_shortens() {
    let (s, _dir) = registry_allowing("admit-copy", 2, &[("itA:copy:0:a0", LEFT_BEHIND)]).await;
    supersede(&s, "itA:copy:0:a0").await;

    sweep(&s).await;

    assert_eq!(keys(&s).await, ["itA:copy:0:a0"]);
}

#[tokio::test]
async fn a_host_whose_slots_are_all_being_watched_admits_no_further_re_encode() {
    let (s, _dir) = registry_allowing(
        "admit-full",
        2,
        &[(TRANSCODE, LIVE), (OTHER_TRANSCODE, LIVE)],
    )
    .await;

    let admitted = admits(&s).await;

    assert!(!admitted);
    assert_eq!(keys(&s).await.len(), 2, "neither viewer was interrupted");
}

#[tokio::test]
async fn a_slot_held_by_a_re_encode_the_viewer_left_is_freed_for_the_one_they_asked_for() {
    let (s, _dir) = registry_allowing(
        "admit-seek",
        2,
        &[(TRANSCODE, LEFT_BEHIND), (OTHER_TRANSCODE, LIVE)],
    )
    .await;
    supersede(&s, TRANSCODE).await;

    let admitted = admits(&s).await;

    assert!(admitted);
    assert_eq!(keys(&s).await, [OTHER_TRANSCODE]);
}

#[tokio::test]
async fn a_stream_copy_never_counts_against_the_re_encode_ceiling() {
    let (s, _dir) = registry_allowing(
        "admit-copies",
        1,
        &[("itA:copy:0:a0", LIVE), ("itB:aac:0:a0", LIVE)],
    )
    .await;

    assert!(admits(&s).await);
}

#[test]
fn the_ceiling_leaves_a_box_at_least_one_re_encode_and_never_more_than_four() {
    let ceiling = max_live_transcodes();

    assert!((1..=4).contains(&ceiling), "{ceiling}");
}
