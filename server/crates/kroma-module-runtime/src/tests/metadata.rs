use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use axum::extract::State;
use axum::http::Uri;
use axum::routing::get;
use axum::{Json, Router};
use kroma_module_host::HostCtx;
use kroma_module_wire::{EpisodeInfo, MatchCandidate};

use crate::RemoteHost;

#[derive(Clone, Default)]
struct Asked(Arc<Mutex<Vec<String>>>);

impl Asked {
    fn note(&self, uri: &Uri) {
        self.0.lock().unwrap().push(uri.to_string());
    }

    fn seen(&self) -> Vec<String> {
        self.0.lock().unwrap().clone()
    }
}

fn dune() -> MatchCandidate {
    MatchCandidate {
        tmdb_id: 438631,
        title: "Dune".into(),
        original_title: None,
        year: Some(2021),
        poster_url: None,
        overview: None,
        rating: None,
        score: 0.98,
        current: false,
    }
}

fn winter_is_coming() -> EpisodeInfo {
    EpisodeInfo {
        episode: 1,
        name: Some("Winter Is Coming".into()),
        overview: None,
        air_date: Some("2011-04-17".into()),
        still_url: None,
    }
}

async fn search(State(asked): State<Asked>, uri: Uri) -> Json<Vec<MatchCandidate>> {
    asked.note(&uri);
    Json(vec![dune()])
}

async fn episodes(State(asked): State<Asked>, uri: Uri) -> Json<Vec<EpisodeInfo>> {
    asked.note(&uri);
    Json(vec![winter_is_coming()])
}

fn start_core(asked: Asked, socket: &std::path::Path) {
    super::serve(
        Router::new()
            .route("/api/_host/metadata-search", get(search))
            .route("/api/_host/metadata-episodes", get(episodes))
            .with_state(asked),
        socket,
    );
}

#[test]
fn a_module_asks_the_core_what_a_title_and_its_episodes_are_called() {
    let dir = super::scratch("host-metadata");
    let asked = Asked::default();
    let core = dir.path().join("core.sock");
    start_core(asked.clone(), &core);
    let (tx, rx) = mpsc::channel();

    let wire = move |host: &RemoteHost| {
        tx.send((
            host.metadata_candidates("Dune", "movie", Some(2021)),
            host.metadata_episodes(1399, 2),
        ))
        .expect("the lookups answered");
        Router::new()
    };
    super::on_a_socket(
        super::env(dir.path(), "tv.kroma.metadata-test", &core),
        &dir.path().join("module.sock"),
        wire,
        vec![],
    );

    let (candidates, episodes) = rx
        .recv_timeout(Duration::from_secs(30))
        .expect("the module reached the core");

    assert_eq!(candidates[0].tmdb_id, 438631);
    assert_eq!(candidates[0].title, "Dune");
    assert_eq!(episodes[0].episode, 1);
    assert_eq!(episodes[0].name.as_deref(), Some("Winter Is Coming"));
    let seen = asked.seen();
    assert!(
        seen[0].contains("q=Dune")
            && seen[0].contains("kind=movie")
            && seen[0].contains("year=2021"),
        "{seen:?}"
    );
    assert!(
        seen[1].contains("tmdbId=1399") && seen[1].contains("season=2"),
        "{seen:?}"
    );
}
