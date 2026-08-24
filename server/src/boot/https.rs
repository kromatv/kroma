//! The optional self-signed HTTPS listener, and the plain-HTTP escape hatch a
//! device needs to fetch and trust that certificate in the first place.

use kroma_engine::state;
use tracing::{info, warn};

use crate::tls;

pub fn spawn_https_listener(
    https: Option<(
        std::path::PathBuf,
        axum_server::tls_rustls::RustlsConfig,
        std::net::SocketAddr,
    )>,
    app: &axum::Router,
    handle: axum_server::Handle,
) {
    let Some((_cert, rustls_config, https_socket)) = https else {
        return;
    };
    info!("KROMA listening on https://{https_socket}  (self-signed)");
    let app_https = app.clone();
    tokio::spawn(async move {
        if let Err(e) = axum_server::bind_rustls(https_socket, rustls_config)
            .handle(handle)
            .serve(app_https.into_make_service_with_connect_info::<std::net::SocketAddr>())
            .await
        {
            warn!(error = %e, "HTTPS listener stopped");
        }
    });
}

pub fn cert_download_route(cert_pem: std::sync::Arc<String>) -> axum::routing::MethodRouter {
    axum::routing::get(move || {
        let pem = cert_pem.clone();
        async move {
            (
                [
                    (axum::http::header::CONTENT_TYPE, "application/x-pem-file"),
                    (
                        axum::http::header::CONTENT_DISPOSITION,
                        "attachment; filename=\"kroma-cert.pem\"",
                    ),
                ],
                (*pem).clone(),
            )
        }
    })
}

// Keeps the cert download on plain HTTP so a device can trust the self-signed
// cert first. 307 (not 303) so non-GET calls keep their method + body, and
// temporary so browsers don't cache it past a later toggle-off.
pub fn https_redirect_router(
    https_port: u16,
    cert_pem: Option<std::sync::Arc<String>>,
) -> axum::Router {
    use axum::http::{header, HeaderMap, StatusCode, Uri};
    use axum::response::{IntoResponse, Redirect};

    let mut router = axum::Router::new();
    if let Some(cert_pem) = cert_pem {
        router = router.route("/api/tls/cert.pem", cert_download_route(cert_pem));
    }
    router.fallback(move |headers: HeaderMap, uri: Uri| async move {
        // The request's own Host header works whether the client reached us by IP or by name.
        let host = headers
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let hostname = host.split(':').next().unwrap_or("").trim();
        if hostname.is_empty() {
            return StatusCode::BAD_REQUEST.into_response();
        }
        let path = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/");
        let target = if https_port == 443 {
            format!("https://{hostname}{path}")
        } else {
            format!("https://{hostname}:{https_port}{path}")
        };
        Redirect::temporary(&target).into_response()
    })
}

// `None` when disabled or when cert/config setup fails (logged; HTTP still serves).
pub async fn build_https(
    state: &state::SharedState,
) -> Option<(
    std::path::PathBuf,
    axum_server::tls_rustls::RustlsConfig,
    std::net::SocketAddr,
)> {
    let config = &state.config;
    let enabled = config
        .https_override
        .unwrap_or_else(|| state.settings.get_bool("httpsEnabled", false));
    if !enabled {
        return None;
    }

    // The rustls crypto provider must be installed before any TLS config is built.
    tls::install_crypto_provider();

    let paths = match tls::ensure_self_signed(&config.tls_dir(), &config.tls_extra_sans) {
        Ok(p) => p,
        Err(e) => {
            warn!(error = %format!("{e:#}"), "HTTPS enabled but the certificate could not be prepared; serving HTTP only");
            return None;
        }
    };

    let rustls_config =
        match axum_server::tls_rustls::RustlsConfig::from_pem_file(&paths.cert_pem, &paths.key_pem)
            .await
        {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, "failed to load the TLS certificate; serving HTTP only");
                return None;
            }
        };

    let port = config
        .https_port_override
        .unwrap_or_else(|| state.settings.get_i64("httpsPort", 4443).clamp(1, 65535) as u16);
    let socket = tls::https_addr(&config.host, port);
    Some((paths.cert_pem, rustls_config, socket))
}
