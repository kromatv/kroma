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
mod mail;
mod media;
pub mod media_ticket;
mod metadata;
mod modules;
mod monitoring;
mod notifications;
pub mod online_subs;
mod origin;
mod passkeys;
mod people;
mod pin;
mod plugin;
mod point;
mod recommend;
mod releases;
mod rematch;
mod reports;
mod requests;
mod search;
mod stream;
mod suggest;
mod themes;
mod util;
mod visibility;

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
mod it_backup;
#[cfg(test)]
mod it_cast;
#[cfg(test)]
mod it_content;
#[cfg(test)]
mod it_diagnostics;
#[cfg(test)]
mod it_external_subtitles;
#[cfg(test)]
mod it_first_run;
#[cfg(test)]
mod it_handoff;
#[cfg(test)]
mod it_host_settings;
#[cfg(test)]
mod it_images;
#[cfg(test)]
mod it_invites;
#[cfg(test)]
mod it_library_visibility;
#[cfg(test)]
mod it_mail_relay;
#[cfg(test)]
mod it_account_identifiers;
#[cfg(test)]
mod it_media;
#[cfg(test)]
mod it_module_frontend;
#[cfg(test)]
mod it_media_bearer;
#[cfg(test)]
mod it_media_ticket;
#[cfg(test)]
mod it_member_reach;
#[cfg(test)]
mod it_monitoring;
#[cfg(test)]
mod it_notification_images;
#[cfg(test)]
mod it_notifications;
#[cfg(test)]
mod it_online_subs;
#[cfg(test)]
mod it_passkeys;
#[cfg(test)]
mod it_pin;
#[cfg(test)]
mod it_pin_lockout;
#[cfg(test)]
mod it_playback;
#[cfg(test)]
mod it_playback_faults;
#[cfg(test)]
mod it_releases;
#[cfg(test)]
mod it_rematch;
#[cfg(test)]
mod it_reports;
#[cfg(test)]
mod it_requests_calendar;
#[cfg(test)]
mod it_requests_ledger;
#[cfg(test)]
mod it_reset;
#[cfg(test)]
mod it_reset_faults;
#[cfg(test)]
mod it_stream_hls;
#[cfg(test)]
mod it_suggest;
#[cfg(test)]
mod it_updates;
#[cfg(test)]
mod it_verify_email;
#[cfg(test)]
mod test_support;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::{ConnectInfo, Path, Request, State};
use axum::handler::HandlerWithoutStateExt;
use axum::http::StatusCode;
use axum::middleware::{from_fn, from_fn_with_state, Next};
use axum::response::{IntoResponse, Response};
use axum::{Extension, Router};
use kroma_module_supervisor::Supervisor;
use tower::ServiceExt;
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

// The host callback surface is for local sidecars only. A request from any
// non-loopback peer is answered 404, so the surface is not advertised off-host.
async fn host_loopback_only(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Response {
    if addr.ip().to_canonical().is_loopback() {
        next.run(req).await
    } else {
        json_error(StatusCode::NOT_FOUND, "not found")
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
    // byte streams. The byte routes sit outside this middleware because a
    // `<video>`/hls element can't attach a bearer, and carry their own credential
    // in the URL instead (see `media_ticket`); they are not open.
    let public = Router::new()
        .merge(accounts::routes())
        .merge(passkeys::routes())
        .merge(pin::routes())
        .merge(handoff::public_routes(state.clone()))
        .merge(invites::routes())
        .merge(mail::routes())
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
    // playback. Knowing the URL no longer lists the library. `themes` is served
    // publicly above: an <audio> element can't attach a bearer and a theme song
    // is not library bytes.
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
        .merge(monitoring::routes())
        .merge(requests::routes())
        .merge(reports::routes())
        .merge(notifications::routes())
        .merge(releases::routes())
        .merge(modules::routes())
        .route_layer(from_fn_with_state(state.clone(), require_session));

    // The admin subtree self-gates per-handler (permission checks), so it lives
    // outside the blanket content layer.
    // The sidecar callbacks always come from a module process on 127.0.0.1
    // (KROMA_CORE_URL is loopback), so they are refused from any other peer:
    // the shared host token is then the second line, not the only one.
    let host = kroma_module_supervisor::host_router::<SharedState>(
        supervisor.clone(),
        kroma_module_host::SettingReachOf(crate::services::settings::reach_of_setting),
    )
    .merge(host_jobs::routes(supervisor.host_token().to_string()))
    .merge(host_events::routes(
        supervisor.host_token().to_string(),
        subscriptions.clone(),
    ))
    .layer(from_fn(host_loopback_only));

    let api = public
        .merge(content)
        .merge(host)
        .route("/module/{id}/{*rest}", axum::routing::any(module_proxy))
        .nest("/admin", admin::routes(state.clone()))
        .layer(Extension(supervisor));

    let mut app = Router::new().nest("/api", api);

    // Installed modules' frontend (Module Federation) assets, served from
    // `<data>/modules/<id>/fe/` at `/modules/<id>/*`, same origin as the API and
    // BEFORE the SPA fallback so an installed remote's `remoteEntry.js` resolves.
    app = app.merge(plugin::asset_routes());

    // Single-binary deploy: serve the built web SPA on the same origin as the API,
    // falling back to the SPA shell for a page navigation to a client-side route
    // (e.g. /movies); any other miss (/robots.txt, a stale chunk) is a 404. Skipped
    // in dev (no KROMA_WEB_DIR), where the web runs on its own Vite server.
    // `precompressed_*` serves the build's `.br`/`.gz` siblings so static assets
    // cost the NAS zero compression CPU; files without one hit CompressionLayer.
    if let Some(web_dir) = state.config.web_dir.clone() {
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
        app = app.fallback_service(
            ServeDir::new(web_dir)
                .precompressed_br()
                .precompressed_gzip()
                .fallback(navigation_only.into_service()),
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

fn accepts_html(headers: &axum::http::HeaderMap) -> bool {
    headers
        .get(axum::http::header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("text/html"))
}

// A Vite content-hashed asset (`Poster-BKMFTghM.js`, `assets/index-DXQwrN_7.css`,
// `cast-B6-ecRbX.js`): a `-<hash>` stem suffix and a non-HTML extension. The hash
// is base64url, so it may itself hold a `-`.
fn is_hashed_asset(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or("");
    if name.ends_with(".html") {
        return false;
    }
    let Some((stem, _ext)) = name.rsplit_once('.') else {
        return false;
    };
    let plain = stem.rsplit_once('-').is_some_and(|(_, h)| {
        h.len() >= HASH_LEN && h.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
    });
    plain || ends_in_base64url_hash(stem.as_bytes())
}

const HASH_LEN: usize = 8;

fn ends_in_base64url_hash(stem: &[u8]) -> bool {
    let Some(sep) = stem.len().checked_sub(HASH_LEN + 1) else {
        return false;
    };
    let hash = &stem[sep + 1..];
    stem[sep] == b'-'
        && hash
            .iter()
            .all(|&b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        && hash
            .iter()
            .any(|&b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};

    use super::*;
    use crate::api::test_support::{raw, test_app_with_web};

    const NAVIGATION: &[(&str, &str)] = &[("accept", "text/html,application/xhtml+xml,*/*;q=0.8")];

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

        let (status, headers, _) = raw(&t.app, "GET", "/movies", None, None, NAVIGATION).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(headers[CONTENT_TYPE], "text/html");
        assert_eq!(headers[CACHE_CONTROL], "no-cache");

        let (status, body) = crate::api::test_support::get(&t.app, "/api/auth/config", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.get("hasAccounts").is_some(), "{body}");
    }

    #[tokio::test]
    async fn a_missing_file_that_is_not_a_page_navigation_is_not_found() {
        let t = test_app_with_web(&[("_shell.html", "<!doctype html><title>KROMA</title>")]);

        for path in ["/robots.txt", "/llms.txt", "/.well-known/ard.json", "/assets/gone-DXQwrN_7.js"] {
            let (status, _, _) = raw(&t.app, "GET", path, None, None, &[("accept", "*/*")]).await;

            assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
        }
    }

    #[test]
    fn only_a_content_hashed_asset_may_be_cached_forever() {
        assert!(is_hashed_asset("/assets/index-DXQwrN_7.css"));
        assert!(is_hashed_asset("/assets/Poster-BKMFTghM.js"));
        assert!(!is_hashed_asset("/index.html"));
        assert!(!is_hashed_asset("/assets/entry-BKMFTghM.html"));
        assert!(!is_hashed_asset("/movies"));
        assert!(!is_hashed_asset("/favicon.ico"));
        assert!(!is_hashed_asset("/assets/logo-dark.svg"));
    }

    #[test]
    fn a_hash_holding_a_dash_is_still_a_content_hash() {
        assert!(is_hashed_asset("/assets/cast-B6-ecRbX.js"));
        assert!(is_hashed_asset("/assets/ui-L_FT-_o-.js"));
        assert!(is_hashed_asset("/assets/nav-UvXRyM2-.js"));
        assert!(is_hashed_asset("/assets/use-focus-ring-DTxN-gJP.js"));
        assert!(!is_hashed_asset("/assets/sun-and-moon.svg"));
        assert!(!is_hashed_asset("/assets/x-ab.js"));
    }
}
