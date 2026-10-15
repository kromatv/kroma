use super::*;

use super::super::test_support::{added, manager_over};

#[test]
fn only_the_downloads_the_ledger_has_let_go_are_named_as_gone() {
    let (_host, manager) = manager_over("torrents-no-longer-held", &[added("d1")]);

    let gone = manager.no_longer_held(vec!["d1".into(), "d2".into()]);

    assert_eq!(gone, HashSet::from(["d2".to_string()]));
}

fn servable(id: &str) -> ServableDownload {
    ServableDownload {
        id: id.into(),
        client_ref: "deadbeef".into(),
        request_id: None,
        kind: "movie".into(),
        tmdb_id: Some(42),
        title: Some("Dune".into()),
        year: Some(2021),
        release_title: format!("Rel.{id}.mkv"),
        status: "downloading".into(),
        progress: 0.0,
        request_title: None,
        poster_url: None,
    }
}

#[test]
fn an_entry_names_the_title_rather_than_what_the_grab_was_filed_as() {
    let kinds = ["movie", "episode", "season"].map(title_kind);

    assert_eq!(kinds, ["movie", "show", "show"].map(str::to_string));
}

#[test]
fn an_entry_carries_what_the_ledger_knows_of_the_download() {
    let file = WatchableFileView {
        index: 2,
        name: "Dune.mkv".into(),
        size_bytes: 8_000_000_000,
        is_video: true,
        season: None,
        episode: None,
    };

    let offered = entry(servable("d1"), vec![file], &HashSet::new());

    assert_eq!(
        (
            offered.id.as_str(),
            offered.title.as_deref(),
            offered.kind.as_str()
        ),
        ("d1", Some("Dune"), "movie")
    );
    assert_eq!((offered.tmdb_id, offered.year), (Some(42), Some(2021)));
    assert_eq!(
        (offered.status.as_str(), offered.files[0].index),
        ("downloading", 2)
    );
}

#[test]
fn an_entry_takes_the_name_and_the_poster_of_the_request_that_grabbed_it() {
    let requested = ServableDownload {
        request_id: Some("req1".into()),
        request_title: Some("Sintel".into()),
        poster_url: Some("https://image.tmdb.org/p.jpg".into()),
        ..servable("d1")
    };

    let offered = entry(requested, Vec::new(), &HashSet::from(["d1".to_string()]));

    assert_eq!(offered.title.as_deref(), Some("Sintel"));
    assert_eq!(
        offered.poster_url.as_deref(),
        Some("https://image.tmdb.org/p.jpg")
    );
    assert!(offered.ephemeral);
}
