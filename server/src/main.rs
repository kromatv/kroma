//! KROMA a self-hosted, direct-play media streaming server.
//!
//! Scans a media library into SQLite, exposes it over a JSON REST API, and
//! range-streams the original files. It never transcodes; `ffprobe` only reads
//! metadata.

// Request guards use the axum `Response` as their Err type so handlers can `?`.
#![allow(clippy::result_large_err)]

mod api;
mod tls;
use kroma_config as config;
use kroma_db as db;
use kroma_engine::{i18n, infra, model, services, state};

use anyhow::Context;
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::config::Config;
use crate::state::AppState;

// An absent tv.kroma.vector sidecar degrades every call to empty vectors, so
// recommendations no-op rather than break.
struct EmbedderClient {
    resolve: kroma_port_bridge::Resolver,
    meta: std::sync::RwLock<Option<serde_json::Value>>,
}
impl EmbedderClient {
    fn new(resolve: kroma_port_bridge::Resolver) -> Self {
        Self { resolve, meta: std::sync::RwLock::new(None) }
    }
    fn meta(&self) -> serde_json::Value {
        if let Some(v) = self.meta.read().unwrap().clone() {
            return v;
        }
        let Some((base, token)) = (self.resolve)() else {
            return serde_json::Value::Null;
        };
        let v = kroma_http::Fetch::new()
            .header("authorization", format!("Bearer {token}"))
            .get_json::<serde_json::Value>(&format!("{base}/_port/embedder/meta"))
            .unwrap_or(serde_json::Value::Null);
        if !v.is_null() {
            *self.meta.write().unwrap() = Some(v.clone());
        }
        v
    }
}
impl kroma_engine::ports::Embedder for EmbedderClient {
    fn dim(&self) -> usize {
        self.meta().get("dim").and_then(serde_json::Value::as_u64).unwrap_or(0) as usize
    }
    fn embed(&self, text: &str) -> Vec<f32> {
        kroma_port_bridge::call_raw(&self.resolve, "embedder/embed", &serde_json::json!({ "text": text }))
            .unwrap_or_default()
    }
    fn embed_batch(&self, texts: &[String]) -> Vec<Vec<f32>> {
        kroma_port_bridge::call_raw(&self.resolve, "embedder/embed_batch", &serde_json::json!({ "texts": texts }))
            .unwrap_or_default()
    }
    fn relevance_floor(&self) -> f32 {
        self.meta().get("relevance_floor").and_then(serde_json::Value::as_f64).map(|f| f as f32).unwrap_or(1.0)
    }
}

// musl's global-lock malloc collapses under our thread mix (tokio workers +
// rayon walks + candle tensors); mimalloc removes that contention.
#[cfg(target_os = "linux")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_engine::process_started();
    // Only this binary knows the released version; the engine crate's own
    // CARGO_PKG_VERSION is a stale 0.1.0.
    kroma_engine::services::settings::set_build_info(
        env!("CARGO_PKG_VERSION"),
        env!("KROMA_GIT_HASH"),
        env!("KROMA_BUILD_DATE"),
    );
    let config = Config::from_env();
    // Held for the whole process so buffered log lines flush to disk.
    let _log_guard = init_tracing(&config.logs_dir());

    info!(
        host = %config.host,
        port = config.port,
        media_dirs = config.media_dirs.len(),
        db = %config.db_path().display(),
        "starting KROMA server"
    );

    let ffprobe_available = infra::probe::ffprobe_available();
    log_ffprobe_status(ffprobe_available);
    log_tmdb_status(&config);

    let db = db::init(&config.db_path()).context("failed to initialise database")?;

    // Must run before any module reads its tables (settings load, `apply_enabled_states`).
    apply_module_schema(&db)?;

    let settings = services::settings::Settings::load(&db);
    let library_defs = services::settings::library_defs(&settings, &config);
    let has_folders = library_defs.iter().any(|d| !d.folders.is_empty());

    // Phase 1: walk + stat only, no ffprobe; codecs/duration/HDR fill in below.
    let mut data = services::scan::scan_all(&library_defs);

    // Configured dirs that produce nothing mean a mount outage, not an empty
    // library: syncing that scan would cascade-delete every library.
    let mount_outage = data.items.is_empty() && has_folders;
    if data.items.is_empty() && !has_folders {
        info!("no media dirs configured; seeding built-in demo content");
        data = services::demo::demo_data();
    }

    persist_startup_scan(&db, &data, mount_outage, config.media_dirs.len())?;

    let addr = config.socket_addr();

    // Built before the module services so ported modules resolve as client
    // proxies to their sidecar. The random token authenticates host callbacks.
    let host_token: String = {
        use rand::RngExt;
        rand::rng()
            .sample_iter(rand::distr::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect()
    };
    let supervisor =
        kroma_module_supervisor::Supervisor::new(kroma_module_supervisor::SupervisorConfig {
            modules_dir: config.data_dir.join("modules"),
            core_url: format!("http://127.0.0.1:{}", config.port),
            host_token: host_token.clone(),
            db_path: config.db_path(),
            data_dir: config.data_dir.clone(),
            // An in-core backend can't be shadowed by an installed `.kmod` of the
            // same id (two live backends); sidecar-only modules are not reserved.
            reserved_ids: kroma_module_kernel::backend_ids(),
            server_version: env!("CARGO_PKG_VERSION").to_string(),
            log_line: Some(std::sync::Arc::new(|id: &str, line: &str| {
                println!("[{id}] {line}");
                infra::logbuf::LOG_BUFFER.push_module_line(id, line);
            })),
        });

    // The composition root owns the module ports so the core names no module.
    let mut module_services: std::collections::HashMap<
        std::any::TypeId,
        std::sync::Arc<dyn std::any::Any + Send + Sync>,
    > = std::collections::HashMap::new();
    module_services.insert(
        std::any::TypeId::of::<kroma_module_supervisor::Supervisor>(),
        supervisor.clone() as std::sync::Arc<dyn std::any::Any + Send + Sync>,
    );
    // Each consumed sidecar is reached by a client proxy: id -> live port -> (url, token).
    let local_resolver = |id: &'static str| -> kroma_port_bridge::Resolver {
        let (sup, tok) = (supervisor.clone(), host_token.clone());
        std::sync::Arc::new(move || {
            sup.port_of(id).map(|p| (format!("http://127.0.0.1:{p}"), tok.clone()))
        })
    };

    let vpn_proxy: std::sync::Arc<dyn kroma_module_sdk::ports::VpnProxyPort> =
        std::sync::Arc::new(kroma_port_bridge::VpnProxyClient::new(local_resolver("tv.kroma.vpn")));
    let (tid, val) = kroma_module_host::port_service(vpn_proxy);
    module_services.insert(tid, val);
    let torrent_fetch: std::sync::Arc<dyn kroma_module_sdk::ports::TorrentFetchPort> =
        std::sync::Arc::new(kroma_port_bridge::TorrentFetchClient::new(local_resolver("tv.kroma.indexer")));
    let (tid, val) = kroma_module_host::port_service(torrent_fetch);
    module_services.insert(tid, val);
    let torznab: std::sync::Arc<dyn kroma_module_sdk::ports::TorznabPort> =
        std::sync::Arc::new(kroma_port_bridge::TorznabClient::new(local_resolver("tv.kroma.torznab")));
    let (tid, val) = kroma_module_host::port_service(torznab);
    module_services.insert(tid, val);
    let idx_db: std::sync::Arc<dyn kroma_module_sdk::ports::IndexerDbPort> =
        std::sync::Arc::new(kroma_port_bridge::IndexerDbClient::new(local_resolver("tv.kroma.indexer")));
    let (tid, val) = kroma_module_host::port_service(idx_db);
    module_services.insert(tid, val);
    let idx_search: std::sync::Arc<dyn kroma_module_sdk::ports::IndexerSearchPort> =
        std::sync::Arc::new(kroma_port_bridge::IndexerSearchClient::new(local_resolver("tv.kroma.indexer")));
    let (tid, val) = kroma_module_host::port_service(idx_search);
    module_services.insert(tid, val);
    let acq_search: std::sync::Arc<dyn kroma_module_sdk::ports::AcquisitionSearchPort> =
        std::sync::Arc::new(kroma_port_bridge::AcquisitionSearchClient::new(local_resolver("tv.kroma.acquisition")));
    let (tid, val) = kroma_module_host::port_service(acq_search);
    module_services.insert(tid, val);
    // tv.kroma.torrents PROVIDES its download ports from its own process, so the
    // core neither constructs the manager nor registers those ports here.
    let whisper_client = std::sync::Arc::new(api::online_subs::WhisperClient::new(
        local_resolver("tv.kroma.whisper"),
        db.clone(),
    ));
    module_services
        .insert(std::any::TypeId::of::<api::online_subs::WhisperClient>(), whisper_client);
    let embedder: std::sync::Arc<dyn kroma_engine::ports::Embedder> =
        std::sync::Arc::new(EmbedderClient::new(local_resolver("tv.kroma.vector")));
    // Empty job roster: sidecars register their own jobs over `/_host/register-job`.
    let state = AppState::new(
        config,
        ffprobe_available,
        db,
        settings,
        embedder,
        module_services,
        &[],
    );
    services::activity::scan_completed(
        &state.activity,
        data.libraries.len(),
        data.shows.len(),
        data.items.len(),
        services::scan::now_iso8601(),
    );

    // Phase 2: ffprobe every unprobed file, overlapping request handling.
    infra::probe::spawn_probe_pass(
        state.db.clone(),
        state.ffprobe_available,
        state.events.clone(),
        state.activity.clone(),
    );

    services::search::spawn_reindex(state.clone());

    services::enrich::maybe_spawn(&state, &data.items, &data.shows);

    // Baseline = the startup scan just applied, so it stays quiet until something changes.
    infra::watch::spawn(state.clone(), infra::watch::signature(&data.items, &data.mtimes));

    state.hls.spawn_reaper();

    state
        .playback
        .spawn_reaper(state.db.clone(), state.events.clone());

    state.cast.spawn_reaper(state.events.clone());

    state.metrics.spawn_sampler();

    state.jobs.clone().spawn_scheduler(state.clone());

    // Brings enabled modules up in dependency order; each starts its own
    // resources in on_enable, so this shell names no module.
    kroma_module_kernel::apply_enabled_states(&state).await;

    let mut app = api::router(state.clone(), supervisor.clone());

    // Built before serving so the cert-download route can be merged into the router.
    let https = build_https(&state).await;
    let mut cert_pem_shared: Option<std::sync::Arc<String>> = None;
    if let Some((cert_path, _, _)) = &https {
        let cert_pem =
            std::sync::Arc::new(std::fs::read_to_string(cert_path).unwrap_or_default());
        app = app.route("/api/tls/cert.pem", cert_download_route(cert_pem.clone()));
        cert_pem_shared = Some(cert_pem);
    }

    // Off by default: a hard redirect onto a self-signed origin walls every
    // client behind a trust prompt, and some TV/native clients can't take it.
    let https_port = https.as_ref().map(|(_, _, sock)| sock.port());
    let redirect_to_https = https.is_some()
        && state
            .config
            .https_redirect_override
            .unwrap_or_else(|| state.settings.get_bool("httpsRedirect", false));

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind {addr}"))?;

    if redirect_to_https {
        info!("KROMA listening on http://{addr}  (redirecting to https)");
    } else {
        info!("KROMA listening on http://{addr}  (API under /api)");
    }

    supervisor.spawn_enabled(&*state);

    spawn_module_auto_update(&state, &supervisor);

    let https_handle = axum_server::Handle::new();
    spawn_https_listener(https, &app, https_handle.clone());

    let http_app = if redirect_to_https {
        https_redirect_router(
            https_port.expect("redirect_to_https implies HTTPS is running"),
            cert_pem_shared,
        )
    } else {
        app
    };

    // Connect-info so handlers can read the client address (LAN/WAN classification).
    axum::serve(
        listener,
        http_app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .context("server error")?;

    https_handle.graceful_shutdown(Some(std::time::Duration::from_secs(3)));

    // Sidecars survive their parent, so skipping this orphans them.
    info!("shutting down: cancelling running jobs + stopping module processes");
    state.jobs.cancel_all();
    await_jobs_drained(&state).await;
    supervisor.stop_all();

    Ok(())
}

// Skips the sync on `mount_outage`: `sync_all` would treat every real library
// as vanished and cascade-delete it along with its probed metadata.
fn persist_startup_scan(
    db: &db::Pool,
    data: &services::scan::ScanData,
    mount_outage: bool,
    media_dirs: usize,
) -> anyhow::Result<()> {
    if mount_outage {
        warn!(
            media_dirs,
            "configured media dirs produced no items; keeping the existing index (mount offline?) and skipping sync"
        );
        return Ok(());
    }
    db::sync_all(db, &data.libraries, &data.shows, &data.items, &data.mtimes)
        .context("failed to persist library")?;
    info!(
        libraries = data.libraries.len(),
        shows = data.shows.len(),
        items = data.items.len(),
        "library index ready (phase 1)"
    );
    Ok(())
}

fn spawn_module_auto_update(
    state: &state::SharedState,
    supervisor: &std::sync::Arc<kroma_module_supervisor::Supervisor>,
) {
    if !state.settings.get_bool("moduleAutoUpdate", true) {
        return;
    }
    let state = state.clone();
    let supervisor = supervisor.clone();
    tokio::spawn(async move {
        let updated = api::admin::store::install::auto_update(&state, &supervisor).await;
        if !updated.is_empty() {
            info!(count = updated.len(), "module auto-update: modules brought current");
        }
    });
}

fn spawn_https_listener(
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

async fn await_jobs_drained(state: &state::SharedState) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
    while state.jobs.running_count() > 0 && std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

fn cert_download_route(cert_pem: std::sync::Arc<String>) -> axum::routing::MethodRouter {
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
fn https_redirect_router(
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
        let host = headers.get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("");
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
async fn build_https(
    state: &state::SharedState,
) -> Option<(std::path::PathBuf, axum_server::tls_rustls::RustlsConfig, std::net::SocketAddr)> {
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

    let rustls_config = match axum_server::tls_rustls::RustlsConfig::from_pem_file(
        &paths.cert_pem,
        &paths.key_pem,
    )
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

fn log_ffprobe_status(available: bool) {
    if available {
        info!("ffprobe detected: full metadata extraction enabled");
    } else {
        warn!("ffprobe not found: metadata will be inferred from file extensions");
    }
}

fn log_tmdb_status(config: &Config) {
    if config.tmdb_api_key.is_some() {
        if infra::metadata::curl_available() {
            info!(language = %config.tmdb_language, "TMDB enrichment enabled");
        } else {
            warn!("KROMA_TMDB_API_KEY is set but `curl` was not found; TMDB enrichment disabled");
        }
    }
}

fn apply_module_schema(db: &db::Pool) -> anyhow::Result<()> {
    let conn = db.get().context("failed to get a db connection for module schema")?;
    for migration in kroma_module_kernel::module_migrations() {
        db::apply_migrations(&conn, migration).context("failed to apply module schema")?;
    }
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
    info!("shutdown signal received");
}

fn init_tracing(log_dir: &std::path::Path) -> Option<tracing_appender::non_blocking::WorkerGuard> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("kroma_server=info,tower_http=info,axum=info,librqbit=info")
    });

    let (file_layer, guard) = match std::fs::create_dir_all(log_dir) {
        Ok(()) => {
            let appender = tracing_appender::rolling::daily(log_dir, "kroma.log");
            let (writer, guard) = tracing_appender::non_blocking(appender);
            let layer = tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_writer(writer);
            (Some(layer), Some(guard))
        }
        Err(e) => {
            // Tracing isn't initialised yet, so report to stderr directly.
            eprintln!(
                "warning: could not create log dir {} ({e}); file logging disabled",
                log_dir.display()
            );
            (None, None)
        }
    };

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .with(file_layer)
        .with(LogBufferLayer)
        .init();

    guard
}

struct LogBufferLayer;

impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for LogBufferLayer {
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        struct Fields {
            message: String,
            extra: String,
        }
        impl tracing::field::Visit for Fields {
            fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
                use std::fmt::Write;
                if field.name() == "message" {
                    let _ = write!(self.message, "{value:?}");
                } else {
                    let sep = if self.extra.is_empty() { "" } else { " " };
                    let _ = write!(self.extra, "{sep}{}={:?}", field.name(), value);
                }
            }
        }
        let mut fields = Fields { message: String::new(), extra: String::new() };
        event.record(&mut fields);
        if !fields.extra.is_empty() {
            if !fields.message.is_empty() {
                fields.message.push(' ');
            }
            fields.message.push_str(&fields.extra);
        }
        let meta = event.metadata();
        infra::logbuf::LOG_BUFFER.push_core(meta.level().as_str(), meta.target(), fields.message);
    }
}
