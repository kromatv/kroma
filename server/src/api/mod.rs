//! API surface: composes each feature module's `routes()` into the `/api`
//! router, then layers CORS, tracing and the SPA fallback. Individual routes
//! live next to their handlers in the submodules, not here.

pub mod admin;
pub mod card;
pub mod dto;
pub mod error;
pub mod playback;
pub mod poster;
pub mod ws;

mod accounts;
mod cast;
mod diagnostics;
mod discover;
mod downloads_overlay;
mod extract;
mod handoff;
mod home;
pub mod host_events;
mod host_jobs;
mod images;
mod invites;
mod media;
mod metadata;
mod modules;
mod notifications;
pub mod online_subs;
mod origin;
mod passkeys;
mod people;
mod pin;
mod plugin;
mod point;
mod recommend;
mod rematch;
mod reports;
mod requests;
mod search;
mod stream;
mod suggest;
mod themes;
mod util;

// Integration-test harness + suites for the HTTP handler layer. `test_support`
// builds a fully wired router over a temp DB (see its docs); the `it_*` modules
// drive real endpoints through it. All `#[cfg(test)]`, so nothing ships.
#[cfg(test)]
mod it_accounts;
#[cfg(test)]
mod it_accounts_faults;
#[cfg(test)]
mod it_admin;
#[cfg(test)]
mod it_admin2;
#[cfg(test)]
mod it_admin_manage;
#[cfg(test)]
mod it_auth;
#[cfg(test)]
mod it_auth_faults;
#[cfg(test)]
mod it_cast;
#[cfg(test)]
mod it_content;
#[cfg(test)]
mod it_diagnostics;
#[cfg(test)]
mod it_handoff;
#[cfg(test)]
mod it_images;
#[cfg(test)]
mod it_invites;
#[cfg(test)]
mod it_media;
#[cfg(test)]
mod it_notification_images;
#[cfg(test)]
mod it_notifications;
#[cfg(test)]
mod it_pin;
#[cfg(test)]
mod it_playback;
#[cfg(test)]
mod it_playback_faults;
#[cfg(test)]
mod it_rematch;
#[cfg(test)]
mod it_reports;
#[cfg(test)]
mod test_support;

use std::sync::Arc;

use axum::extract::{Path, Request, State};
use axum::http::StatusCode;
use axum::middleware::{from_fn_with_state, Next};
use axum::response::{IntoResponse, Response};
use axum::{Extension, Router};
use kroma_module_supervisor::Supervisor;
use tower_http::compression::predicate::{NotForContentType, Predicate};
use tower_http::compression::{CompressionLayer, DefaultPredicate};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

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
async fn module_proxy(
    Extension(sup): Extension<Arc<Supervisor>>,
    Path((id, rest)): Path<(String, String)>,
    req: Request,
) -> Response {
    match sup.port_of(&id) {
        Some(port) => {
            let query = req
                .uri()
                .query()
                .map(|q| format!("?{q}"))
                .unwrap_or_default();
            kroma_module_supervisor::proxy_to(port, &format!("/{rest}{query}"), req).await
        }
        None => (StatusCode::NOT_FOUND, "module not running").into_response(),
    }
}

/// Build the application router: `/api` route groups (public + session-gated),
/// the module reverse proxy and host callbacks, static module/SPA assets, then
/// CORS, compression and tracing layers.
pub fn router(
    state: SharedState,
    supervisor: Arc<Supervisor>,
    subscriptions: Arc<host_events::Subscriptions>,
) -> Router {
    // Public endpoints reachable before (or without) a session: the auth
    // handshake + roster + invites, uploaded avatars/art, liveness, and the media
    // byte streams (a `<video>`/hls element can't attach a bearer these carry no
    // catalogue listing and stay open under the LAN trust model).
    let public = Router::new()
        .merge(accounts::routes())
        .merge(passkeys::routes())
        .merge(pin::routes())
        .merge(handoff::public_routes(state.clone()))
        .merge(invites::routes())
        .merge(images::routes())
        .merge(media::public_routes())
        .merge(stream::routes())
        .merge(online_subs::public_routes())
        .merge(themes::routes())
        .merge(modules::public_routes())
        .merge(diagnostics::routes())
        .merge(ws::routes());

    // Content endpoints require a valid session: the catalogue listing + detail,
    // search, people, metadata, discovery/requests, home rows and per-user
    // playback. Knowing the URL no longer lists the library. `themes` +
    // downloaded-subtitle bytes are served publicly above they're fetched by an
    // <audio> element / plain fetch that can't attach a bearer.
    let content = Router::new()
        .merge(media::routes())
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
        .merge(rematch::routes())
        .merge(requests::routes())
        .merge(reports::routes())
        .merge(notifications::routes())
        .merge(modules::routes())
        .route_layer(from_fn_with_state(state.clone(), require_session));

    // Each feature module owns its routes via a `routes()` function. The admin
    // subtree gets its own `/admin` prefix and self-gates per-handler (permission
    // checks), so it lives outside the blanket content layer.
    // Out-of-process (.kmod) modules: the /api/_host/* callback API they call back
    // into (token-authed, resolved against the core's HostCtx), and a reverse
    // proxy `/api/module/<id>/*` forwarding to the installed module's process.
    let api = public
        .merge(content)
        .merge(kroma_module_supervisor::host_router::<SharedState>(
            supervisor.host_token().to_string(),
        ))
        // A sidecar registers its scheduled jobs with the core JobManager here, so
        // they appear in admin Tâches like in-core jobs (same host-token guard).
        .merge(host_jobs::routes(supervisor.host_token().to_string()))
        // And the topics it wants delivered, so it can react to what other
        // modules and the core publish rather than only being called.
        .merge(host_events::routes(
            supervisor.host_token().to_string(),
            subscriptions.clone(),
        ))
        .route("/module/{id}/{*rest}", axum::routing::any(module_proxy))
        .nest("/admin", admin::routes(state.clone()))
        .layer(Extension(supervisor));

    let mut app = Router::new().nest("/api", api);

    // Installed modules' frontend (Module Federation) assets, served from
    // `<data>/modules/<id>/fe/` at `/modules/<id>/*`, same origin as the API and
    // BEFORE the SPA fallback so an installed remote's `remoteEntry.js` resolves.
    app = app.merge(plugin::asset_routes());

    // Single-binary deploy: serve the built web SPA on the same origin as the API,
    // falling back to the SPA shell for client-side routes (e.g. /films). Skipped
    // in dev (no KROMA_WEB_DIR), where the web runs on its own Vite server.
    // `precompressed_*` serves the build's `.br`/`.gz` siblings so static assets
    // cost the NAS zero compression CPU; files without one hit CompressionLayer.
    if let Some(web_dir) = state.config.web_dir.clone() {
        let shell = web_dir.join("_shell.html");
        app = app.fallback_service(
            ServeDir::new(web_dir)
                .precompressed_br()
                .precompressed_gzip()
                .fallback(
                    ServeFile::new(shell)
                        .precompressed_br()
                        .precompressed_gzip(),
                ),
        );
    }

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

    app.layer(origin::cors(&state.config.allowed_origins))
        .layer(compression)
        .layer(axum::middleware::from_fn(spa_cache_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

// Vite content-hashes every built asset, so hashed files are immutable (cache
// a year) while the shell and unhashed files revalidate. Without this the TV
// re-downloads the whole bundle on every app launch. `/api/*` is left untouched.
async fn spa_cache_headers(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::http::{header, HeaderValue};

    let path = req.uri().path().to_string();
    let mut res = next.run(req).await;
    if path.starts_with("/api/") || res.headers().contains_key(header::CACHE_CONTROL) {
        return res;
    }
    let policy = if is_hashed_asset(&path) {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    res.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static(policy));
    res
}

// A Vite content-hashed asset (`Poster-BKMFTghM.js`, `assets/index-DXQwrN_7.css`):
// a `-<hash>` stem suffix of 8+ [A-Za-z0-9_] chars and a non-HTML extension.
fn is_hashed_asset(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or("");
    if name.ends_with(".html") {
        return false;
    }
    let Some((stem, _ext)) = name.rsplit_once('.') else {
        return false;
    };
    stem.rsplit_once('-').is_some_and(|(_, h)| {
        h.len() >= 8 && h.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
    })
}

#[cfg(test)]
mod tests {
    use axum::http::header::CACHE_CONTROL;

    use super::*;
    use crate::api::test_support::{raw, test_app_with_web, text};

    #[tokio::test]
    async fn a_client_side_route_falls_back_to_the_spa_shell_without_shadowing_the_api() {
        let t = test_app_with_web(&[
            ("_shell.html", "<!doctype html><title>KROMA</title>"),
            ("assets/index-DXQwrN_7.js", "console.log(1)"),
        ]);

        let (status, headers, _) =
            raw(&t.app, "GET", "/assets/index-DXQwrN_7.js", None, None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            headers[CACHE_CONTROL],
            "public, max-age=31536000, immutable"
        );

        let (status, shell) = text(&t.app, "GET", "/films", None, None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(shell.contains("<title>KROMA</title>"), "{shell}");
        let (_, headers, _) = raw(&t.app, "GET", "/films", None, None, &[]).await;
        assert_eq!(headers[CACHE_CONTROL], "no-cache");

        let (status, body) = crate::api::test_support::get(&t.app, "/api/auth/config", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.get("hasAccounts").is_some(), "{body}");
    }

    #[test]
    fn only_a_content_hashed_asset_may_be_cached_forever() {
        assert!(is_hashed_asset("/assets/index-DXQwrN_7.css"));
        assert!(is_hashed_asset("/assets/Poster-BKMFTghM.js"));
        assert!(!is_hashed_asset("/index.html"));
        assert!(!is_hashed_asset("/assets/entry-BKMFTghM.html"));
        assert!(!is_hashed_asset("/films"));
        assert!(!is_hashed_asset("/favicon.ico"));
        assert!(!is_hashed_asset("/assets/logo-dark.svg"));
    }
}
