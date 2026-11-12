use std::future::Future;
use std::sync::OnceLock;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use bytes::Bytes;
use http_body_util::{BodyExt, Full, Limited};
use hyper::body::Incoming;

use super::transport::Request;
use crate::response::Response;

/// Memory guard on a response body: what one wrong peer may make this process
/// allocate, not a size any real payload on the seam approaches.
pub const MAX_BODY_BYTES: usize = 64 * 1024 * 1024;

pub(super) fn prepared(request: &Request<'_>, uri: &str) -> Result<hyper::Request<Full<Bytes>>> {
    let mut prepared = hyper::Request::builder()
        .method(request.method.as_str())
        .uri(uri);
    for (name, value) in request.headers {
        prepared = prepared.header(name, value);
    }
    let body = match request.body {
        Some((content_type, bytes)) => {
            prepared = prepared.header("content-type", content_type);
            Bytes::copy_from_slice(bytes)
        }
        None => Bytes::new(),
    };
    prepared
        .body(Full::new(body))
        .context("build the loopback request")
}

pub(super) fn exchange(
    timeout: Duration,
    sent: impl Future<Output = Result<hyper::Response<Incoming>>> + Send + 'static,
) -> Result<Response> {
    block_on(async move {
        tokio::time::timeout(timeout, async move { collected(sent.await?).await })
            .await
            .context("the loopback peer did not answer in time")?
    })
}

async fn collected(response: hyper::Response<Incoming>) -> Result<Response> {
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.as_str().to_string(),
                String::from_utf8_lossy(value.as_bytes()).into_owned(),
            )
        })
        .collect();
    let body = Limited::new(response.into_body(), MAX_BODY_BYTES)
        .collect()
        .await
        .map_err(|e| anyhow::anyhow!("read the loopback response body: {e}"))?;
    Ok(Response {
        status,
        headers,
        body: body.to_bytes().to_vec(),
    })
}

fn runtime() -> &'static tokio::runtime::Runtime {
    static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .thread_name("kroma-loopback")
            .enable_all()
            .build()
            .expect("build the loopback runtime")
    })
}

fn block_on<T>(future: impl Future<Output = Result<T>> + Send + 'static) -> Result<T>
where
    T: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    runtime().spawn(async move {
        let _ = tx.send(future.await);
    });
    match rx.recv() {
        Ok(outcome) => outcome,
        Err(_) => bail!("the loopback exchange ended without a response"),
    }
}
