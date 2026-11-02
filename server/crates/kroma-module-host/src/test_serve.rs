//! Standing a port's provider end up on a real localhost port, for the tests
//! that drive a contract across the wire it actually crosses.
//!
//! Behind its own feature rather than [`testing`](crate::testing) because a
//! contract crate testing both ends of an HTTP port has no database: `testing`
//! pulls `kroma-db`, and a torznab or VPN contract must not link SQLite to run
//! its round-trip test.

#[cfg(target_family = "wasm")]
mod in_process;

use std::sync::Arc;

use axum::Router;

use crate::Resolver;

const TOKEN: &str = "test-token";

/// Serve a provider's port routes on an ephemeral localhost port and hand back a
/// [`Resolver`] pointing at it, so a port's two ends can be tested against each
/// other over the real wire. The token is `"test-token"`. The server has a
/// thread of its own, so a test on a single-threaded runtime can block on it. A
/// WebAssembly component holds no socket, so there the routes answer in-process,
/// through a loopback transport of their own.
pub async fn serve<S: Clone + Send + Sync + 'static>(router: Router<S>, state: S) -> Resolver {
    let base = listen(router.with_state(state));
    Arc::new(move || Some((base.clone(), TOKEN.to_string())))
}

#[cfg(not(target_family = "wasm"))]
fn listen(app: Router) -> String {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    std::thread::Builder::new()
        .name("kroma-test-serve".into())
        .spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            runtime.block_on(async move {
                let listener = tokio::net::TcpListener::from_std(listener).unwrap();
                let _ = axum::serve(listener, app).await;
            });
        })
        .unwrap();
    base
}

#[cfg(target_family = "wasm")]
fn listen(app: Router) -> String {
    in_process::mount(app)
}

/// Run a port client's blocking call off the async runtime, panicking on a join
/// failure, and in place in a WebAssembly component, which has only the one
/// thread. Port methods are sync, so a `#[tokio::test]` cannot call one directly.
pub async fn blocking<T: Send + 'static>(job: impl FnOnce() -> T + Send + 'static) -> T {
    crate::run_blocking(job).await.unwrap()
}
