use std::sync::Arc;

use axum::extract::{Path, Request, State};
use axum::handler::HandlerWithoutStateExt;
use axum::http::StatusCode;
use axum::middleware::{Next, from_fn_with_state};
use axum::response::{IntoResponse, Response};
use axum::{Extension, Router};
use kroma_module_supervisor::Supervisor;
use tower::ServiceExt;
use tower_http::compression::predicate::{NotForContentType, Predicate};
use tower_http::compression::{CompressionLayer, DefaultPredicate};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use super::spa::{accepts_html, spa_cache_headers};
use super::{
    accounts, admin, cast, diagnostics, direct, discover, handoff, home, images, inbound, invites,
    mail, media, metadata, modules, monitoring, notifications, online_subs, origin, passkeys,
    people, pin, playback, plugin, recommend, releases, rematch, remote_art, reports, requests,
    search, server_status, sso, stream, suggest, themes, trailers, ws,
};
use crate::api::error::json_error;
use crate::api::extract::bearer_from_headers;
use crate::state::SharedState;

// Rejects a missing/expired/unknown bearer with 401 before the handler runs,
// so the catalogue can't be listed anonymously.
async fn require_session(State(state): State<SharedState>, req: Request, next: Next) -> Response {
    let Some(token) = bearer_from_headers(req.headers()) else {
        return json_error(StatusCode::UNAUTHORIZED, "authentication required");
    };
    let pool = state.db.clone();
    let ok = tokio::task::spawn_blocking(move || crate::db::session_user(&pool, &token))
        .await
        .ok()
        .and_then(|r| r.ok())
        .flatten()
        .is_some();
    if ok {
        next.run(req).await
    } else {
        json_error(StatusCode::UNAUTHORIZED, "authentication required")
    }
}

// Reverse-proxies to the installed module's process; the module validates the
// forwarded bearer itself against the shared DB.
pub(super) async fn module_proxy(
    Extension(sup): Extension<Arc<Supervisor>>,
    Path((id, rest)): Path<(String, String)>,
    req: Request,
) -> Response {
    match sup.endpoint_of(&id) {
        Some(endpoint) => {
            let query = req
                .uri()
                .query()
                .map(|q| format!("?{q}"))
                .unwrap_or_default();
            kroma_module_supervisor::proxy_to(&endpoint, &format!("/{rest}{query}"), req).await
        }
        None => (StatusCode::NOT_FOUND, "module not running").into_response(),
    }
}

/// Build the application router: `/api` route groups (public + session-gated),
/// the module reverse proxy, static module/SPA assets, then CORS, compression
/// and tracing layers. The host callbacks are on the core's own socket only
/// ([`seam::router`]).
pub fn router(state: SharedState, supervisor: Arc<Supervisor>) -> Router {
    // The admin subtree self-gates per-handler (permission checks), so it lives
    // outside the blanket content layer.
    let api = public_routes(&state)
        .merge(content_routes(&state))
        .route("/module/{id}/{*rest}", axum::routing::any(module_proxy))
        .nest("/admin", admin::routes(state.clone()))
        .layer(from_fn_with_state(state.clone(), remote_art::serve_art))
        .layer(Extension(supervisor));

    // Installed modules' frontend (Module Federation) assets, served from
    // `<data>/modules/<id>/fe/` at `/modules/<id>/*`, same origin as the API and
    // BEFORE the SPA fallback so an installed remote's `remoteEntry.js` resolves.
    let app = Router::new()
        .nest("/api", api)
        .merge(plugin::asset_routes());
    let app = with_web_shell(app, &state);

    // Compress JSON + SPA assets on the fly (big win for catalog payloads on the
    // LAN). Media bytes are exempt: video/audio streams and HLS segments are
    // already-compressed formats where gzip only burns the NAS CPU, and the image
    // endpoints serve WebP/JPEG (the default predicate already skips image/*).
    let compression = CompressionLayer::new().compress_when(
        DefaultPredicate::new()
            .and(NotForContentType::new("video/"))
            .and(NotForContentType::new("audio/"))
            .and(NotForContentType::new("application/vnd.apple.mpegurl")),
    );

    app.layer(origin::cors(&state.config, state.direct.origins()))
        .layer(compression)
        .layer(from_fn_with_state(state.clone(), inbound::tally))
        .layer(axum::middleware::from_fn(spa_cache_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

fn public_routes(state: &SharedState) -> Router<SharedState> {
    // Public endpoints reachable before (or without) a session: the auth
    // handshake + roster + invites, uploaded avatars/art, liveness, and the media
    // byte streams. The byte routes sit outside this middleware because a
    // `<video>`/hls element can't attach a bearer, and carry their own credential
    // in the URL instead (see `media_ticket`); they are not open.
    Router::new()
        .merge(accounts::routes())
        .merge(passkeys::routes())
        .merge(sso::routes())
        .merge(pin::routes())
        .merge(handoff::public_routes(state.clone()))
        .merge(invites::routes())
        .merge(mail::routes())
        .merge(images::routes())
        .merge(remote_art::routes())
        .merge(media::public_routes())
        .merge(server_status::public_routes())
        .merge(direct::public_routes())
        .merge(stream::routes())
        .merge(online_subs::public_routes())
        .merge(themes::routes())
        .merge(trailers::public_routes())
        .merge(modules::public_routes())
        .merge(diagnostics::routes())
        .merge(ws::routes())
}

fn content_routes(state: &SharedState) -> Router<SharedState> {
    // Content endpoints require a valid session: the catalogue listing + detail,
    // search, people, metadata, discovery/requests, home rows and per-user
    // playback. Knowing the URL no longer lists the library. `themes` is served
    // publicly above: an <audio> element can't attach a bearer and a theme song
    // is not library bytes.
    Router::new()
        .merge(media::routes())
        .merge(server_status::routes())
        .merge(direct::routes())
        .merge(stream::protected_routes())
        .merge(search::routes())
        .merge(people::routes())
        .merge(metadata::routes())
        .merge(recommend::routes())
        .merge(suggest::routes())
        .merge(online_subs::routes())
        .merge(home::routes())
        .merge(playback::routes())
        .merge(cast::routes())
        .merge(handoff::routes())
        .merge(discover::routes())
        .merge(trailers::routes())
        .merge(rematch::routes())
        .merge(monitoring::routes())
        .merge(requests::routes())
        .merge(reports::routes())
        .merge(notifications::routes())
        .merge(releases::routes())
        .merge(modules::routes())
        .route_layer(from_fn_with_state(state.clone(), require_session))
}

fn with_web_shell(app: Router<SharedState>, state: &SharedState) -> Router<SharedState> {
    // Single-binary deploy: serve the built web SPA on the same origin as the API,
    // falling back to the SPA shell for a page navigation to a client-side route
    // (e.g. /movies); any other miss (/robots.txt, a stale chunk) is a 404. Skipped
    // in dev (no KROMA_WEB_DIR), where the web runs on its own Vite server.
    // `precompressed_*` serves the build's `.br`/`.gz` siblings so static assets
    // cost the NAS zero compression CPU; files without one hit CompressionLayer.
    let Some(web_dir) = state.config.web_dir.clone() else {
        return app;
    };
    let shell = ServeFile::new(web_dir.join("_shell.html"))
        .precompressed_br()
        .precompressed_gzip();
    let navigation_only = move |req: Request| async move {
        if accepts_html(req.headers()) {
            shell.oneshot(req).await.into_response()
        } else {
            StatusCode::NOT_FOUND.into_response()
        }
    };
    app.fallback_service(
        ServeDir::new(web_dir)
            .precompressed_br()
            .precompressed_gzip()
            .fallback(navigation_only.into_service()),
    )
}
