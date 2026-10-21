use super::*;
use crate::db::test_support::download;
use crate::{TorrentState, TorrentStatus};

fn status(state: TorrentState, progress: f64) -> TorrentStatus {
    TorrentStatus {
        client_ref: "ref".into(),
        name: "Release".into(),
        info_hash: None,
        progress,
        state,
        down_bps: 0,
        up_bps: 0,
        peers: 0,
        peers_seen: 0,
        size_bytes: 0,
        save_path: None,
        files: Vec::new(),
        error: None,
        lifetime_downloaded_bytes: 0,
        lifetime_uploaded_bytes: 0,
    }
}

#[test]
fn a_paused_torrent_that_has_not_moved_writes_nothing() {
    let row = download("d1", "paused", 0);
    let polled = status(TorrentState::Paused, row.progress);

    let new_status = ledger_status(&polled, false);

    assert!(!progress_moved(&row, &polled, new_status));
    assert!(!bytes_moved(&row, &polled));
}

#[test]
fn progress_a_state_change_or_an_error_is_written() {
    let row = download("d1", "downloading", 0);
    let mut further = status(TorrentState::Downloading, row.progress + 0.01);
    let paused = status(TorrentState::Paused, row.progress);
    let mut failing = status(TorrentState::Downloading, row.progress);
    failing.error = Some("tracker unreachable".into());
    further.lifetime_downloaded_bytes = 1;

    assert!(progress_moved(
        &row,
        &further,
        ledger_status(&further, false)
    ));
    assert!(progress_moved(&row, &paused, ledger_status(&paused, false)));
    assert!(progress_moved(
        &row,
        &failing,
        ledger_status(&failing, false)
    ));
    assert!(bytes_moved(&row, &further));
}

#[test]
fn a_save_path_only_counts_once_the_engine_reports_one() {
    let mut row = download("d1", "downloading", 0);
    row.save_path = Some("/downloads/a".into());
    let silent = status(TorrentState::Downloading, row.progress);
    let mut moved = status(TorrentState::Downloading, row.progress);
    moved.save_path = Some("/downloads/b".into());

    assert!(!progress_moved(&row, &silent, "downloading"));
    assert!(progress_moved(&row, &moved, "downloading"));
}
