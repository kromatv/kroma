use super::super::naming::session_dir;
use super::super::session::testing::{fill, keys, registry, registry_with_budget, LIVE};
use super::*;

const QUIET: Duration = Duration::from_secs(BUDGET_GRACE.as_secs() + 5);
const DEAD: Duration = Duration::from_secs(IDLE_TIMEOUT.as_secs() + 30);

#[tokio::test]
async fn the_cap_takes_the_oldest_session_that_has_gone_quiet() {
    let (s, _dir) = registry(
        "quiet",
        2,
        &[("itA:copy:0:a0", QUIET), ("itB:aac:0:a0", LIVE)],
    )
    .await;

    {
        let mut map = s.inner.lock().await;
        s.make_room(&mut map).await;
    }

    assert_eq!(keys(&s).await, ["itB:aac:0:a0"]);
    assert!(!s.root.join(session_dir("itA:copy:0:a0")).exists());
}

#[tokio::test]
async fn the_cap_never_takes_a_session_someone_is_reading() {
    let (s, _dir) = registry(
        "cap-live",
        2,
        &[
            ("itA:copy:0:a0", Duration::from_secs(3)),
            ("itB:aac:0:a0", LIVE),
        ],
    )
    .await;

    {
        let mut map = s.inner.lock().await;
        s.make_room(&mut map).await;
    }

    assert_eq!(keys(&s).await, ["itA:copy:0:a0", "itB:aac:0:a0"]);
}

#[tokio::test]
async fn superseded_siblings_are_reclaimed_only_once_quiet() {
    let (s, _dir) = registry(
        "supersede",
        8,
        &[
            ("itA:copy:0:a0", QUIET), // the same program, gone quiet: superseded
            ("itA:aac:600:a0", LIVE), // the same program but still being read
            ("itA:copy:0:a1", QUIET), // another language track = another program
            ("itB:copy:0:a0", QUIET), // another title
        ],
    )
    .await;
    {
        let mut map = s.inner.lock().await;
        s.reap_superseded(&mut map, "itA:aac-night:900:a0", None).await;
    }
    assert_eq!(
        keys(&s).await,
        ["itA:aac:600:a0", "itA:copy:0:a1", "itB:copy:0:a0"]
    );
    assert!(!s.root.join(session_dir("itA:copy:0:a0")).exists());
}

#[tokio::test]
async fn superseding_a_re_encode_asks_for_a_sweep_where_superseding_a_copy_does_not() {
    let (s, _dir) = registry(
        "supersede-reports",
        8,
        &[("itA:h264-1080-copy:0:a0", LIVE), ("itB:copy:0:a0", LIVE)],
    )
    .await;
    let mut map = s.inner.lock().await;

    let re_encode = s
        .reap_superseded(&mut map, "itA:h264-1080-copy:600:a0", None)
        .await;
    let copy = s.reap_superseded(&mut map, "itB:copy:600:a0", None).await;

    assert!(re_encode);
    assert!(!copy);
}

#[tokio::test]
async fn a_sibling_another_viewer_is_reading_survives_a_seek_that_supersedes_it() {
    let (s, _dir) = registry("arriving", 8, &[("itA:copy:0:a0", LIVE)]).await;

    {
        let mut map = s.inner.lock().await;
        s.reap_superseded(&mut map, "itA:copy:600:a0", None).await;
    }

    assert_eq!(keys(&s).await, ["itA:copy:0:a0"]);
}

#[tokio::test]
async fn a_superseded_session_is_taken_a_grace_later_rather_than_a_whole_idle_timeout() {
    let (s, _dir) = registry("superseded-grace", 8, &[("itA:copy:0:a0", LIVE)]).await;
    {
        let mut map = s.inner.lock().await;
        s.reap_superseded(&mut map, "itA:copy:600:a0", None).await;
        *map.get("itA:copy:0:a0")
            .expect("seeded")
            .last_access
            .lock()
            .await = Instant::now() - QUIET;
    }

    s.reap_once().await;

    assert!(keys(&s).await.is_empty());
}

#[tokio::test]
async fn a_superseded_session_read_again_keeps_the_ordinary_idle_life() {
    let (s, _dir) = registry("superseded-revived", 8, &[("itA:copy:0:a0", LIVE)]).await;
    {
        let mut map = s.inner.lock().await;
        s.reap_superseded(&mut map, "itA:copy:600:a0", None).await;
        let session = map.get("itA:copy:0:a0").expect("seeded");
        session.keep();
        *session.last_access.lock().await = Instant::now() - QUIET;
    }

    s.reap_once().await;

    assert_eq!(keys(&s).await, ["itA:copy:0:a0"]);
}

#[tokio::test]
async fn the_budget_is_enforced_against_what_survives_the_reap() {
    let (s, _dir) = registry_with_budget(
        "budget-order",
        8,
        500,
        &[
            ("itA:copy:0:a0", DEAD),
            ("itB:copy:0:a0", QUIET),
            ("itC:copy:0:a0", QUIET),
        ],
    )
    .await;
    fill(&s, "itA:copy:0:a0", 1000);
    fill(&s, "itB:copy:0:a0", 100);
    fill(&s, "itC:copy:0:a0", 100);

    s.reap_once().await;

    assert_eq!(keys(&s).await, ["itB:copy:0:a0", "itC:copy:0:a0"]);
}

#[tokio::test]
async fn the_budget_still_trims_when_the_survivors_alone_exceed_it() {
    let (s, _dir) = registry_with_budget(
        "budget-trim",
        8,
        500,
        &[("itA:copy:0:a0", QUIET), ("itB:copy:0:a0", LIVE)],
    )
    .await;
    fill(&s, "itA:copy:0:a0", 400);
    fill(&s, "itB:copy:0:a0", 400);

    s.reap_once().await;

    assert_eq!(
        keys(&s).await,
        ["itB:copy:0:a0"],
        "the quiet one goes, the live one stays"
    );
}

// The idle list is drawn up, the lock is released for the pruning, and the
// viewer presses play in that window.
#[tokio::test]
async fn a_session_revived_before_the_eviction_lands_is_spared() {
    let (s, _dir) = registry("revived", 8, &[("itA:copy:0:a0", DEAD)]).await;
    {
        let mut map = s.inner.lock().await;
        *map.get("itA:copy:0:a0")
            .expect("seeded")
            .last_access
            .lock()
            .await = Instant::now();
        s.evict_if_still_idle(&mut map, "itA:copy:0:a0").await;
    }
    assert_eq!(keys(&s).await, ["itA:copy:0:a0"]);
    assert!(
        s.root.join(session_dir("itA:copy:0:a0")).exists(),
        "its segments survive too"
    );
}

#[tokio::test]
async fn a_session_still_idle_when_the_eviction_lands_is_taken() {
    let (s, _dir) = registry("still-idle", 8, &[("itA:copy:0:a0", DEAD)]).await;
    {
        let mut map = s.inner.lock().await;
        s.evict_if_still_idle(&mut map, "itA:copy:0:a0").await;
    }
    assert!(keys(&s).await.is_empty());
}

#[tokio::test]
async fn discarding_a_directory_frees_its_name_before_it_returns() {
    let data = kroma_testing::temp_dir("hls-test-discard");
    let dir = data.path().join("s");
    std::fs::create_dir_all(&dir).expect("session dir");
    std::fs::write(dir.join("seg_00001.m4s"), b"x").expect("segment");

    discard_dir(&dir);

    assert!(!dir.exists());
}

#[tokio::test]
async fn eviction_reports_the_bytes_it_frees() {
    let (s, _dir) = registry_with_budget("freed", 8, 500, &[("itA:copy:0:a0", QUIET)]).await;
    fill(&s, "itA:copy:0:a0", 300);

    let freed = {
        let mut map = s.inner.lock().await;
        s.evict(&mut map, "itA:copy:0:a0").await
    };

    assert_eq!(freed, 300);
}

#[tokio::test]
async fn prune_dir_removes_only_what_is_behind_the_cutoff() {
    let data = kroma_testing::temp_dir("hls-test-prune");
    let dir = data.path().join("s");
    std::fs::create_dir_all(&dir).expect("session dir");
    for name in [
        "seg_00001.m4s",
        "seg_00009.m4s",
        "seg_00010.m4s",
        "init.mp4",
        "index.m3u8",
    ] {
        std::fs::write(dir.join(name), b"x").expect("segment");
    }
    prune_dir(&dir, 10);
    assert!(!dir.join("seg_00001.m4s").exists());
    assert!(!dir.join("seg_00009.m4s").exists());
    assert!(dir.join("seg_00010.m4s").exists());
    assert!(dir.join("init.mp4").exists());
    assert!(dir.join("index.m3u8").exists());
}
