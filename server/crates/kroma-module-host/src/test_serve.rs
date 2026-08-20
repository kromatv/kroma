//! Standing a port's provider end up on a real localhost port, for the tests
//! that drive a contract across the wire it actually crosses.
//!
//! Behind its own feature rather than [`testing`](crate::testing) because a
//! contract crate testing both ends of an HTTP port has no database: `testing`
//! pulls `kroma-db`, and a torznab or VPN contract must not link SQLite to run
//! its round-trip test.

use std::sync::Arc;

use axum::Router;

use crate::Resolver;

/// Serve a provider's port routes on an ephemeral localhost port and hand back a
/// [`Resolver`] pointing at it, so a port's two ends can be tested against each
/// other over the real wire. The token is `"test-token"`.
pub async fn serve<S: Clone + Send + Sync + 'static>(router: Router<S>, state: S) -> Resolver {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = router.with_state(state);
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    let base = format!("http://{addr}");
    Arc::new(move || Some((base.clone(), "test-token".to_string())))
}

/// Run a port client's blocking call off the async runtime, panicking on a join
/// failure. Port methods are sync, so a `#[tokio::test]` cannot call one directly.
pub async fn blocking<T: Send + 'static>(job: impl FnOnce() -> T + Send + 'static) -> T {
    tokio::task::spawn_blocking(job).await.unwrap()
}
