use std::sync::Arc;

use kroma_module_sdk::host::HostStorage;

use super::super::test_support::{added, manager_over};
use super::*;

fn manager_with(rows: &[DownloadRow]) -> Arc<DownloadManager> {
    manager_over("torrents-play", rows).1
}

#[test]
fn a_minted_token_resolves_to_the_file_it_was_granted_for() {
    let manager = manager_with(&[added("d1")]);

    let granted = manager.grant_play("d1", 2).unwrap();

    let grant = manager.play_grant(&granted.token).unwrap();
    assert_eq!(
        (grant.download_id.as_str(), grant.client_ref.as_str()),
        ("d1", "deadbeef")
    );
    assert_eq!(
        (grant.file_index, grant.expires_at),
        (2, granted.expires_at)
    );
}

#[test]
fn only_a_watch_download_is_narrowed_to_what_is_being_played() {
    let (host, manager) = manager_over("torrents-play-narrow", &[added("d1"), added("d2")]);
    db::mark_ephemeral(host.store(), "d1").unwrap();

    let narrowed = ["d1", "d2"].map(|id| manager.narrows_to_what_is_watched(&added(id)));

    assert_eq!(narrowed, [true, false]);
}

#[test]
fn a_narrowed_watch_keeps_the_file_being_played_selected() {
    let (_host, manager) = manager_over("torrents-play-keeps", &[added("d1")]);

    let keeping = manager.watched_with_its_subtitles("d1", 2);

    assert_eq!(keeping, vec![2]);
}

#[test]
fn one_token_is_handed_out_again_rather_than_a_fresh_one_per_call() {
    let manager = manager_with(&[added("d1")]);

    let minted = [0, 1, 2].map(|_| manager.grant_play("d1", 2).unwrap().token);

    assert_eq!(minted[0], minted[1]);
    assert_eq!(minted[1], minted[2]);
    assert_eq!(manager.play_grants.lock().unwrap().len(), 1);
}

#[test]
fn another_file_of_the_same_download_gets_its_own_token() {
    let manager = manager_with(&[added("d1")]);

    let minted = [2, 5].map(|file| manager.grant_play("d1", file).unwrap().token);

    assert_ne!(minted[0], minted[1]);
    assert!(manager.grants_file(&minted[0], "d1", 2));
    assert!(!manager.grants_file(&minted[0], "d1", 5));
}

#[test]
fn a_grant_is_minted_again_six_hours_before_it_expires_so_a_long_film_never_401s() {
    let now = 1_000_000;
    let grants =
        [PLAY_GRANT_TTL_MS, RENEW_WITHIN_MS + 1, RENEW_WITHIN_MS, 0].map(|left| PlayGrant {
            download_id: "d1".into(),
            client_ref: "deadbeef".into(),
            file_index: 0,
            expires_at: now + left,
        });

    let handed_out_again = grants.map(|grant| grant.lasts_past(now));

    assert_eq!(handed_out_again, [true, true, false, false]);
}

#[test]
fn erasing_a_download_leaves_none_of_its_tokens_a_credential() {
    let manager = manager_with(&[added("d1"), added("d2")]);
    let minted = ["d1", "d2"].map(|id| manager.grant_play(id, 0).unwrap().token);

    manager.revoke_grants("d1");

    assert!(!manager.grants_file(&minted[0], "d1", 0));
    assert!(manager.grants_file(&minted[1], "d2", 0));
}

#[test]
fn a_token_stops_resolving_once_its_grant_has_expired() {
    let manager = manager_with(&[]);
    let minted_at = 1_000_000;

    let (token, _) = manager.mint(added("d1"), 0, minted_at);

    assert!(manager
        .grant_at(&token, minted_at + PLAY_GRANT_TTL_MS - 1)
        .is_some());
    assert!(manager
        .grant_at(&token, minted_at + PLAY_GRANT_TTL_MS)
        .is_none());
}

#[test]
fn a_download_the_embedded_engine_cannot_read_is_never_granted() {
    let manager = manager_with(&[
        DownloadRow {
            client_id: "qbittorrent".into(),
            ..added("foreign")
        },
        DownloadRow {
            client_ref: String::new(),
            ..added("unadded")
        },
    ]);

    let granted = ["foreign", "unadded", "missing"].map(|id| manager.grant_play(id, 0).is_ok());

    assert_eq!(granted, [false; 3]);
}
