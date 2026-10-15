use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;

use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{
    blocking, call_raw, json_error, pinned_resolver, AuthUser, HostStorage,
};

use crate::db;

const ACQUISITION: &str = "acquisition";
const MAX_TITLE_CHARS: usize = 300;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum Kind {
    Movie,
    Show,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBody {
    tmdb_id: u64,
    kind: Kind,
    title: String,
    year: Option<u32>,
    season: Option<u32>,
    episode: Option<u32>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
struct Started {
    download_id: String,
    #[serde(default)]
    release: String,
    #[serde(default)]
    reused: bool,
}

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/watch/start", post(start::<S>))
}

async fn start<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<StartBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::WatchablePlay)?;
    let title = body.title.trim();
    let unplaced = body.kind == Kind::Show && (body.season.is_none() || body.episode.is_none());
    if body.tmdb_id == 0 || title.is_empty() || title.chars().count() > MAX_TITLE_CHARS || unplaced
    {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "a title and its TMDB id are required, and for a show a season and an episode",
        ));
    }
    let request = json!({
        "tmdb_id": body.tmdb_id,
        "kind": body.kind,
        "title": title,
        "year": body.year,
        "season": body.season,
        "episode": body.episode,
    });
    let peer = state.clone();
    let answer = tokio::task::spawn_blocking(move || {
        let resolve = pinned_resolver(&peer, ACQUISITION, None)
            .ok_or_else(|| anyhow::anyhow!("no module answers the acquisition point"))?;
        call_raw::<_, Result<Started, String>>(&resolve, &format!("{ACQUISITION}/watch"), &request)
    })
    .await;
    match answer {
        Ok(Ok(Ok(started))) => {
            // Whoever asked for it is offered it, and a download handed back as
            // `reused` was asked for by this viewer too.
            let (store, id, who) = (state.store().clone(), started.download_id.clone(), user.id);
            if blocking(move || db::mark_watch_starter(&store, &id, &who))
                .await
                .is_err()
            {
                tracing::warn!(download = %started.download_id, "could not record who started a watch download");
            }
            Ok(Json(started).into_response())
        }
        Ok(Ok(Err(reason))) => Err(json_error(StatusCode::UNPROCESSABLE_ENTITY, &reason)),
        Ok(Err(e)) => Err(unanswered(&e)),
        Err(_) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal error",
        )),
    }
}

fn unanswered(e: &anyhow::Error) -> Response {
    if e.downcast_ref::<tokio::time::error::Elapsed>().is_some() {
        return json_error(
            StatusCode::GATEWAY_TIMEOUT,
            "the search took too long to answer; the download may still start, so check what is watchable before asking again",
        );
    }
    json_error(
        StatusCode::BAD_GATEWAY,
        &format!("the acquisition point failed: {e:#}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::host::testing::StubHost;

    use crate::watch::test_support::{member, post_json, BEARER};

    fn dune() -> serde_json::Value {
        json!({ "tmdbId": 438_631, "kind": "movie", "title": "Dune", "year": 2021 })
    }

    async fn started(host: StubHost, body: serde_json::Value) -> StatusCode {
        post_json(routes(), host, "/watch/start", body).await.0
    }

    fn signed_in() -> StubHost {
        StubHost::new().with_session(BEARER, member())
    }

    #[test]
    fn the_point_answer_is_read_in_snake_case_and_handed_on_in_camel_case() {
        let answer = json!({ "download_id": "d1", "release": "Sintel.2010.1080p", "reused": true });

        let started: Started = serde_json::from_value(answer).unwrap();

        assert_eq!(
            serde_json::to_value(started).unwrap(),
            json!({ "downloadId": "d1", "release": "Sintel.2010.1080p", "reused": true })
        );
    }

    #[tokio::test]
    async fn a_point_that_never_answers_is_a_timeout_that_may_still_start() {
        let elapsed = tokio::time::timeout(std::time::Duration::ZERO, std::future::pending::<()>())
            .await
            .unwrap_err();
        let error = anyhow::Error::new(elapsed).context("the loopback peer did not answer in time");

        let response = unanswered(&error);

        assert_eq!(response.status(), StatusCode::GATEWAY_TIMEOUT);
    }

    #[test]
    fn a_point_that_cannot_be_reached_is_a_bad_gateway() {
        let error = anyhow::anyhow!("connection refused");

        let response = unanswered(&error);

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    }

    #[tokio::test]
    async fn a_show_without_both_numbers_is_refused_before_any_indexer_is_swept() {
        let unplaced =
            json!({ "tmdbId": 95_396, "kind": "show", "title": "Severance", "season": 1 });

        let refused = started(signed_in(), unplaced).await;

        assert_eq!(refused, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn a_kind_that_is_neither_a_film_nor_a_show_is_refused_by_the_body() {
        let nonsense = json!({ "tmdbId": 438_631, "kind": "album", "title": "Dune" });

        let refused = started(signed_in(), nonsense).await;

        assert_eq!(refused, StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn a_title_with_no_tmdb_id_is_refused() {
        let nameless = json!({ "tmdbId": 0, "kind": "movie", "title": "Dune" });

        let refused = started(signed_in(), nameless).await;

        assert_eq!(refused, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn a_server_where_nothing_answers_acquisition_says_so_rather_than_hanging() {
        let refused = started(signed_in(), dune()).await;

        assert_eq!(refused, StatusCode::BAD_GATEWAY);
    }

    #[tokio::test]
    async fn an_account_that_may_not_play_a_download_starts_none() {
        let ungranted = signed_in().with_gates_enforced();

        let refused = started(ungranted, dune()).await;

        assert_eq!(refused, StatusCode::FORBIDDEN);
    }
}
