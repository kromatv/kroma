use serde_json::json;

use super::*;

fn group(status: &str) -> Group {
    serde_json::from_value(json!({
        "NZBID": 7,
        "NZBName": "Some.Show.S01E01",
        "Status": status,
        "DestDir": "/data/dst/Some.Show",
        "FileSizeLo": 1_000,
        "FileSizeHi": 0,
        "RemainingSizeLo": 250,
        "RemainingSizeHi": 0,
        "PausedSizeLo": 0,
        "DownloadedSizeLo": 750,
    }))
    .unwrap()
}

fn history(status: &str) -> HistoryItem {
    serde_json::from_value(json!({
        "NZBID": 7,
        "Name": "Some.Show.S01E01",
        "Status": status,
        "DestDir": "/data/dst/Some.Show",
        "FinalDir": "",
        "FileSizeLo": 1_000,
        "DownloadedSizeLo": 1_000,
    }))
    .unwrap()
}

#[test]
fn a_downloading_group_reports_progress_and_the_live_rate() {
    let s = group("DOWNLOADING").into_status(2_000);

    assert_eq!(s.state, JobState::Downloading);
    assert_eq!(s.progress, 0.75);
    assert_eq!(s.down_bps, 2_000);
    assert_eq!(s.size_bytes, 1_000);
    assert_eq!(s.client_ref, "7");
    assert_eq!(s.save_path.as_deref(), Some("/data/dst/Some.Show"));
}

#[test]
fn progress_counts_against_what_is_not_paused() {
    let mut g = group("DOWNLOADING");
    g.paused_size_lo = 200;
    g.remaining_size_lo = 200;

    assert_eq!(g.into_status(0).progress, 1.0);
}

#[test]
fn only_the_downloading_group_takes_the_rate() {
    assert_eq!(group("PAUSED").into_status(2_000).down_bps, 0);
    assert_eq!(group("QUEUED").into_status(2_000).down_bps, 0);
}

#[test]
fn queue_statuses_map_onto_the_waiting_states() {
    assert_eq!(group("QUEUED").into_status(0).state, JobState::Queued);
    assert_eq!(group("FETCHING").into_status(0).state, JobState::Queued);
    assert_eq!(group("PAUSED").into_status(0).state, JobState::Paused);
    assert_eq!(group("SOMETHING_NEW").into_status(0).state, JobState::Queued);
}

#[test]
fn every_post_processing_status_is_processing_at_full_progress() {
    for status in PROCESSING {
        let s = group(status).into_status(0);

        assert_eq!(s.state, JobState::Processing, "{status}");
        assert_eq!(s.progress, 1.0, "{status}");
    }
}

#[test]
fn a_group_never_reads_as_completed() {
    for status in PROCESSING.iter().chain(&["QUEUED", "PAUSED", "DOWNLOADING"]) {
        assert_ne!(group(status).into_status(0).state, JobState::Completed);
    }
}

#[test]
fn sizes_join_their_low_and_high_halves() {
    let mut g = group("QUEUED");
    g.file_size_hi = 1;
    g.file_size_lo = 5;

    assert_eq!(g.into_status(0).size_bytes, (1 << 32) + 5);
}

#[test]
fn a_final_dir_wins_over_the_destination() {
    let mut item = history("SUCCESS/ALL");
    item.final_dir = "/data/final".into();

    assert_eq!(item.into_status().save_path.as_deref(), Some("/data/final"));
}

#[test]
fn a_successful_history_item_is_completed() {
    for status in ["SUCCESS/ALL", "SUCCESS/UNPACK", "SUCCESS/PAR", "SUCCESS/HEALTH", "SUCCESS/GOOD", "SUCCESS/MARK", "WARNING/SCRIPT"] {
        let s = history(status).into_status();

        assert_eq!(s.state, JobState::Completed, "{status}");
        assert_eq!(s.progress, 1.0, "{status}");
        assert_eq!(s.error, None, "{status}");
        assert_eq!(s.save_path.as_deref(), Some("/data/dst/Some.Show"));
    }
}

#[test]
fn a_history_item_the_client_gave_up_on_is_failed_and_names_the_status() {
    for status in [
        "FAILURE/PAR",
        "FAILURE/UNPACK",
        "FAILURE/HEALTH",
        "FAILURE/FETCH",
        "DELETED/MANUAL",
        "DELETED/DUPE",
        "WARNING/PASSWORD",
        "WARNING/HEALTH",
        "WARNING/DAMAGED",
    ] {
        let s = history(status).into_status();

        assert_eq!(s.state, JobState::Failed, "{status}");
        assert!(s.error.unwrap().contains(status), "{status}");
    }
}

#[test]
fn the_rate_prefers_the_split_fields_over_the_deprecated_one() {
    let split: ServerStatus =
        serde_json::from_value(json!({ "DownloadRate": 1, "DownloadRateLo": 9, "DownloadRateHi": 0 }))
            .unwrap();
    let old: ServerStatus = serde_json::from_value(json!({ "DownloadRate": 4 })).unwrap();

    assert_eq!(split.download_rate(), 9);
    assert_eq!(old.download_rate(), 4);
}

#[test]
fn the_status_keys_are_the_ones_the_consumer_reads() {
    let v = serde_json::to_value(group("DOWNLOADING").into_status(5)).unwrap();

    assert_eq!(
        v,
        json!({
            "client_ref": "7",
            "name": "Some.Show.S01E01",
            "info_hash": null,
            "progress": 0.75,
            "state": "downloading",
            "down_bps": 5,
            "up_bps": 0,
            "peers": 0,
            "peers_seen": 0,
            "size_bytes": 1000,
            "save_path": "/data/dst/Some.Show",
            "files": [],
            "error": null,
            "lifetime_downloaded_bytes": 750,
            "lifetime_uploaded_bytes": 0,
        })
    );
}
