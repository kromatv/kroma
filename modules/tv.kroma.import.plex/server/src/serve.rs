use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, State};
use axum::routing::post;
use axum::{Extension, Json, Router};
use kroma_module_sdk::host::{port_reply, HostStorage};
use kroma_module_sdk::primitives::now_ms;

use crate::plex::Plex;
use crate::web::{Live, Web};
use crate::wire::{
    ConnectAsk, Connected, ForgetAsk, PlayPage, PlaysAsk, StatePage, StatesAsk, Survey, SurveyAsk,
    TitlePage, TitlesAsk,
};

const MAX_ASK_BYTES: usize = 64 * 1024;

type Network = Extension<Arc<dyn Web>>;
type Reply<T> = Json<Result<T, String>>;

/// The `importer` point as this module answers it: `connect`, `survey`,
/// `titles`, `states`, `plays` and `forget`, each at
/// `POST /_port/importer/<method>`.
pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    routes_over(Arc::new(Live))
}

pub(crate) fn routes_over<S>(web: Arc<dyn Web>) -> Router<S>
where
    S: HostStorage + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/_port/importer/connect", post(connect::<S>))
        .route("/_port/importer/survey", post(survey::<S>))
        .route("/_port/importer/titles", post(titles::<S>))
        .route("/_port/importer/states", post(states::<S>))
        .route("/_port/importer/plays", post(plays::<S>))
        .route("/_port/importer/forget", post(forget::<S>))
        .layer(DefaultBodyLimit::max(MAX_ASK_BYTES))
        .layer(Extension(web))
}

fn plex<S: HostStorage>(host: &S, web: Arc<dyn Web>) -> Plex {
    Plex::new(web, host.store().clone())
}

async fn connect<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(web): Network,
    Json(ask): Json<ConnectAsk>,
) -> Reply<Connected> {
    let plex = plex(&host, web);
    port_reply(move || plex.connect(&ask, now_ms() / 1000)).await
}

async fn survey<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(web): Network,
    Json(ask): Json<SurveyAsk>,
) -> Reply<Survey> {
    let plex = plex(&host, web);
    port_reply(move || plex.survey(&ask)).await
}

async fn titles<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(web): Network,
    Json(ask): Json<TitlesAsk>,
) -> Reply<TitlePage> {
    let plex = plex(&host, web);
    port_reply(move || plex.titles(&ask)).await
}

async fn states<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(web): Network,
    Json(ask): Json<StatesAsk>,
) -> Reply<StatePage> {
    let plex = plex(&host, web);
    port_reply(move || plex.states(&ask)).await
}

async fn plays<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(web): Network,
    Json(ask): Json<PlaysAsk>,
) -> Reply<PlayPage> {
    let plex = plex(&host, web);
    port_reply(move || plex.plays(&ask)).await
}

async fn forget<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(web): Network,
    Json(ask): Json<ForgetAsk>,
) -> Reply<()> {
    let plex = plex(&host, web);
    port_reply(move || plex.forget(&ask)).await
}

#[cfg(test)]
mod tests;
