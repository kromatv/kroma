use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, State};
use axum::routing::post;
use axum::{Extension, Json, Router};
use kroma_module_sdk::host::{port_reply, HostStorage};

use crate::dialect::JELLYFIN;
use crate::web::{Live, Web};
use crate::wire::{
    ConnectAsk, Connected, ForgetAsk, PlayPage, PlaysAsk, StatePage, StatesAsk, Survey, SurveyAsk,
    TitlePage, TitlesAsk, UnlockRefusal, Unlocked,
};
use crate::{sign_ins, Importer};

const MAX_ASK_BYTES: usize = 64 * 1024;

type Reply<T> = Json<Result<T, String>>;
type Shared = Extension<Arc<dyn Web>>;

/// The `importer` point as this module answers it, for a Jellyfin server.
pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    routes_over(Arc::new(Live))
}

pub(crate) fn routes_over<S: HostStorage + Clone + Send + Sync + 'static>(
    web: Arc<dyn Web>,
) -> Router<S> {
    Router::new()
        .route("/_port/importer/connect", post(connect::<S>))
        .route("/_port/importer/survey", post(survey::<S>))
        .route("/_port/importer/titles", post(titles::<S>))
        .route("/_port/importer/states", post(states::<S>))
        .route("/_port/importer/plays", post(plays::<S>))
        .route("/_port/importer/unlock", post(unlock))
        .route("/_port/importer/forget", post(forget::<S>))
        .layer(Extension(web))
        .layer(DefaultBodyLimit::max(MAX_ASK_BYTES))
}

fn importer<S: HostStorage>(host: &S, web: Arc<dyn Web>) -> Importer {
    Importer {
        store: host.store().clone(),
        web,
        dialect: &JELLYFIN,
    }
}

async fn connect<S: HostStorage + Clone>(
    State(host): State<S>,
    Extension(web): Shared,
    Json(ask): Json<ConnectAsk>,
) -> Reply<Connected> {
    let importer = importer(&host, web);
    port_reply(move || importer.connect(&ask)).await
}

async fn survey<S: HostStorage + Clone>(
    State(host): State<S>,
    Extension(web): Shared,
    Json(ask): Json<SurveyAsk>,
) -> Reply<Survey> {
    let importer = importer(&host, web);
    port_reply(move || importer.survey(&ask)).await
}

async fn titles<S: HostStorage + Clone>(
    State(host): State<S>,
    Extension(web): Shared,
    Json(ask): Json<TitlesAsk>,
) -> Reply<TitlePage> {
    let importer = importer(&host, web);
    port_reply(move || importer.titles(&ask)).await
}

async fn states<S: HostStorage + Clone>(
    State(host): State<S>,
    Extension(web): Shared,
    Json(ask): Json<StatesAsk>,
) -> Reply<StatePage> {
    let importer = importer(&host, web);
    port_reply(move || importer.states(&ask)).await
}

async fn plays<S: HostStorage + Clone>(
    State(host): State<S>,
    Extension(web): Shared,
    Json(ask): Json<PlaysAsk>,
) -> Reply<PlayPage> {
    let importer = importer(&host, web);
    port_reply(move || importer.plays(&ask)).await
}

async fn unlock() -> Reply<Unlocked> {
    Json(Ok(Unlocked::Refused {
        reason: UnlockRefusal::NotLocked,
    }))
}

async fn forget<S: HostStorage + Clone>(
    State(host): State<S>,
    Json(ask): Json<ForgetAsk>,
) -> Reply<()> {
    let store = host.store().clone();
    port_reply(move || sign_ins::forget(&store, &ask.sign_in)).await
}

#[cfg(test)]
mod tests;
