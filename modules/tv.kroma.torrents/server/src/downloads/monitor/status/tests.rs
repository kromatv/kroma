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

#[test]
fn a_transfer_the_client_is_still_unpacking_is_not_finished() {
    let unpacking = status(TorrentState::Processing, 1.0);

    assert!(!is_finished("usenet", &unpacking));
    assert_eq!(ledger_status(&unpacking, false), "downloading");
}

#[test]
fn a_download_the_client_gave_up_on_is_failed_not_finished() {
    let mut given_up = status(TorrentState::Failed, 0.4);
    given_up.error = Some("missing articles".into());

    assert!(!is_finished("usenet", &given_up));
    assert_eq!(ledger_status(&given_up, false), "failed");
}

#[test]
fn a_torrent_at_full_progress_is_finished_whatever_it_calls_itself() {
    assert!(is_finished("torrent", &status(TorrentState::Downloading, 1.0)));
    assert!(is_finished("", &status(TorrentState::Downloading, 1.0)));
    assert!(is_finished("torrent", &status(TorrentState::Seeding, 0.2)));
    assert!(!is_finished("torrent", &status(TorrentState::Downloading, 0.99)));
}

#[test]
fn any_other_protocol_is_finished_only_when_its_client_says_so() {
    assert!(!is_finished("usenet", &status(TorrentState::Downloading, 1.0)));
    assert!(is_finished("usenet", &status(TorrentState::Completed, 1.0)));
}
