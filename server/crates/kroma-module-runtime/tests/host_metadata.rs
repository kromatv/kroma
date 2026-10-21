use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use axum::extract::State;
use axum::http::Uri;
use axum::routing::get;
use axum::{Json, Router};
use kroma_module_host::HostCtx;
use kroma_module_wire::{EpisodeInfo, MatchCandidate};

mod support;

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

fn start_core(asked: Asked) -> u16 {
    support::serve(
        Router::new()
            .route("/api/_host/metadata-search", get(search))
            .route("/api/_host/metadata-episodes", get(episodes))
            .with_state(asked),
    )
}

#[test]
fn a_sidecar_asks_the_core_what_a_title_and_its_episodes_are_called() {
    let dir = std::path::PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("host-metadata");
    std::fs::create_dir_all(&dir).expect("tmp dir");
    let asked = Asked::default();
    let core = start_core(asked.clone());
    std::env::set_var("KROMA_MODULE_ID", "tv.kroma.metadata-test");
    std::env::set_var("KROMA_MODULE_PORT", support::free_port().to_string());
    std::env::set_var("KROMA_CORE_URL", format!("http://127.0.0.1:{core}/"));
    std::env::set_var("KROMA_HOST_TOKEN", "host-token");
    std::env::set_var("KROMA_DB_PATH", dir.join("core.db").display().to_string());
    std::env::set_var("KROMA_DATA_DIR", dir.display().to_string());
    let (tx, rx) = mpsc::channel();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        let wire = move |host: &kroma_module_runtime::RemoteHost| {
            tx.send((
                host.metadata_candidates("Dune", "movie", Some(2021)),
                host.metadata_episodes(1399, 2),
            ))
            .expect("the lookups answered");
            Router::new()
        };
        rt.block_on(kroma_module_runtime::serve(wire, vec![]))
            .expect("serve");
    });

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
