use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use kroma_module_sdk::db::apply_migrations;
use kroma_module_sdk::host::testing::StubHost;
use serde_json::{json, Value};
use tower::ServiceExt;

use super::*;

use crate::dialect::Method;
use crate::test_support::{fixture, Recorded, ADDRESS, ANA, FILMS, SERVER};

const HEAT: &str = "c0000000000000000000000000000001";
const ALIEN: &str = "c0000000000000000000000000000002";

struct Served {
    app: Router,
    jellyfin: Arc<Recorded>,
    _host: StubHost,
}

fn household() -> Recorded {
    let hers = [("userId", ANA), ("parentId", FILMS)];
    let played = [("userId", ANA), ("filters", "IsPlayed")];
    let counted = [("userId", ANA), ("filters", "IsPlayed"), ("limit", "0")];
    Recorded::jellyfin()
        .on(
            JELLYFIN.items.path,
            &[("parentId", FILMS)],
            fixture(include_str!("../fixtures/films-page.json")),
        )
        .on(
            JELLYFIN.items.path,
            &[("ids", ALIEN)],
            fixture(include_str!("../fixtures/alien-versions.json")),
        )
        .on(
            JELLYFIN.items.path,
            &hers,
            fixture(include_str!("../fixtures/ana-films.json")),
        )
        .on(
            JELLYFIN.items.path,
            &played,
            fixture(include_str!("../fixtures/ana-played.json")),
        )
        .on(
            JELLYFIN.items.path,
            &counted,
            json!({ "Items": [], "TotalRecordCount": 2 }),
        )
}

fn served(jellyfin: Recorded) -> Served {
    let host = StubHost::with_db("import-jellyfin-routes");
    apply_migrations(&host.store().get().unwrap(), sign_ins::MIGRATIONS).unwrap();
    let jellyfin = Arc::new(jellyfin);
    Served {
        app: routes_over::<StubHost>(jellyfin.clone()).with_state(host.clone()),
        jellyfin,
        _host: host,
    }
}

impl Served {
    async fn posted(&self, method: &str, ask: &Value) -> (StatusCode, Value) {
        let request = Request::post(format!("/_port/importer/{method}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(ask.to_string()))
            .unwrap();
        let response = self.app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let body = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&body).unwrap_or(Value::Null))
    }

    async fn asked(&self, method: &str, ask: Value) -> Value {
        self.posted(method, &ask).await.1
    }

    fn form(&self, password: &str) -> Value {
        json!({ "fields": { "url": ADDRESS, "username": "sam", "password": password } })
    }

    async fn signed_in(&self) -> String {
        let answer = self
            .asked("connect", self.form(self.jellyfin.password()))
            .await;
        answer["Ok"]["signIn"]
            .as_str()
            .expect("a ready sign-in")
            .to_string()
    }
}

#[tokio::test]
async fn connect_answers_ready_with_the_reference_and_the_server() {
    let served = served(household());

    let answer = served
        .asked("connect", served.form(served.jellyfin.password()))
        .await;

    let sign_in = answer["Ok"]["signIn"].as_str().unwrap().to_string();
    assert_eq!(
        answer,
        json!({ "Ok": {
            "status": "ready",
            "signIn": sign_in,
            "servers": [{ "id": SERVER, "name": "Living room", "address": ADDRESS }],
        }})
    );
}

#[tokio::test]
async fn a_refused_sign_in_is_an_answer_and_not_a_failure() {
    let served = served(household());

    let answer = served
        .asked("connect", served.form("not the password"))
        .await;

    assert_eq!(
        answer,
        json!({ "Ok": { "status": "refused", "reason": "credentials" } })
    );
}

#[tokio::test]
async fn an_ask_with_a_field_this_importer_does_not_know_is_still_read() {
    let served = served(household());
    let mut ask = served.form(served.jellyfin.password());
    ask["somethingNewer"] = json!({ "language": "fr" });

    let answer = served.asked("connect", ask).await;

    assert_eq!(answer["Ok"]["status"], json!("ready"));
}

#[tokio::test]
async fn survey_answers_libraries_users_counts_and_what_stays_behind() {
    let served = served(household());
    let sign_in = served.signed_in().await;

    let answer = served
        .asked("survey", json!({ "signIn": sign_in, "server": SERVER }))
        .await;

    let survey = &answer["Ok"];
    assert_eq!(
        survey["libraries"][0],
        json!({ "id": FILMS, "name": "Films", "kind": "movies", "folders": ["/data/movies", "/data/movies-4k"] })
    );
    assert_eq!(
        survey["users"][0],
        json!({
            "id": ANA,
            "name": "ana",
            "signedIn": false,
            "allLibraries": false,
            "libraries": [FILMS],
            "finerLimits": [],
        })
    );
    assert_eq!(
        survey["counts"],
        json!({ "titles": 5094, "states": 2, "plays": 2 })
    );
    assert_eq!(survey["leftBehind"], json!(["collections"]));
}

#[tokio::test]
async fn titles_answers_a_page_in_the_contract_s_words() {
    let served = served(household());
    let sign_in = served.signed_in().await;
    let ask = json!({ "signIn": sign_in, "server": SERVER, "library": FILMS, "limit": 500 });

    let answer = served.asked("titles", ask).await;

    assert_eq!(
        answer,
        json!({ "Ok": { "titles": [
            {
                "id": HEAT,
                "kind": "movie",
                "paths": ["/data/movies/Heat (1995)/Heat (1995).mkv"],
                "title": "Heat",
                "year": 1995,
                "ids": { "tmdb": "949", "imdb": "tt0113277" },
            },
            {
                "id": ALIEN,
                "kind": "movie",
                "paths": [
                    "/data/movies/Alien (1979)/Alien (1979) - 1080p.mkv",
                    "/data/movies/Alien (1979)/Alien (1979) - 2160p.mkv",
                ],
                "title": "Alien",
                "year": 1979,
                "ids": { "tmdb": "348", "imdb": "tt0078748" },
            },
        ]}})
    );
}

#[tokio::test]
async fn states_answers_a_page_in_the_contract_s_units() {
    let served = served(household());
    let sign_in = served.signed_in().await;
    let ask = json!({
        "signIn": sign_in, "server": SERVER, "user": ANA, "library": FILMS,
        "changedSince": 1_700_000_000, "limit": 500,
    });

    let answer = served.asked("states", ask).await;

    assert_eq!(
        answer,
        json!({ "Ok": { "states": [
            {
                "title": HEAT,
                "watched": true,
                "playCount": 3,
                "durationMs": 10_200_000,
                "lastPlayedAt": 1_700_000_000,
                "favourite": true,
            },
            {
                "title": ALIEN,
                "watched": false,
                "playCount": 1,
                "positionMs": 1_234_000,
                "durationMs": 7_020_000,
                "lastPlayedAt": 1_700_086_400,
                "favourite": false,
            },
        ]}})
    );
}

#[tokio::test]
async fn plays_answers_a_page_and_the_cursor_of_the_next() {
    let served = served(household());
    let sign_in = served.signed_in().await;
    let ask = json!({ "signIn": sign_in, "server": SERVER, "cursor": format!("{ANA}/played/0"), "limit": 500 });

    let answer = served.asked("plays", ask).await;

    assert_eq!(
        answer,
        json!({ "Ok": {
            "plays": [{
                "id": format!("{ANA}:{HEAT}:1700000000"),
                "user": ANA,
                "title": HEAT,
                "playedAt": 1_700_000_000,
            }],
            "next": format!("{ANA}/started/0"),
        }})
    );
}

#[tokio::test]
async fn forget_answers_nothing_and_the_sign_in_is_gone() {
    let served = served(household());
    let sign_in = served.signed_in().await;

    let forgotten = served.asked("forget", json!({ "signIn": sign_in })).await;
    let again = served.asked("forget", json!({ "signIn": sign_in })).await;
    let after = served
        .asked("survey", json!({ "signIn": sign_in, "server": SERVER }))
        .await;

    assert_eq!(forgotten, json!({ "Ok": null }));
    assert_eq!(again, json!({ "Ok": null }));
    assert_eq!(
        after,
        json!({ "Err": "this sign-in to Jellyfin is not kept here. Sign in again." })
    );
}

#[tokio::test]
async fn forgetting_a_sign_in_asks_the_other_server_nothing() {
    let served = served(household());
    let sign_in = served.signed_in().await;
    let before = served.jellyfin.paths().len();

    served.asked("forget", json!({ "signIn": sign_in })).await;

    assert_eq!(served.jellyfin.paths().len(), before);
}

#[tokio::test]
async fn an_ask_past_the_size_a_form_may_have_is_refused_before_it_is_read() {
    let served = served(household());
    let large = served.form(&"x".repeat(70 * 1024));

    let (status, _) = served.posted("connect", &large).await;

    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert!(served.jellyfin.paths().is_empty());
}

#[tokio::test]
async fn a_whole_import_reads_the_other_server_and_changes_nothing_on_it() {
    let served = served(household());
    let sign_in = served.signed_in().await;
    let on_server = json!({ "signIn": sign_in, "server": SERVER });
    let in_library = json!({ "signIn": sign_in, "server": SERVER, "library": FILMS, "user": ANA });

    served.asked("survey", on_server.clone()).await;
    served.asked("titles", in_library.clone()).await;
    served.asked("states", in_library).await;
    served.asked("plays", on_server).await;

    let calls: Vec<(Method, String)> = served.jellyfin.seen(|seen| {
        seen.iter()
            .map(|call| (call.method, call.path.clone()))
            .collect()
    });
    let table = JELLYFIN.calls();
    let written: Vec<&str> = calls
        .iter()
        .filter(|(method, _)| *method != Method::Get)
        .map(|(_, path)| path.as_str())
        .collect();
    assert!(calls.len() > 15);
    assert!(calls.iter().all(|(method, path)| table
        .iter()
        .any(|call| call.method == *method && call.path == path)));
    assert_eq!(written, vec!["/Users/AuthenticateByName"]);
}
