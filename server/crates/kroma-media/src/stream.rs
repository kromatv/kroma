//! HTTP range streaming of original media files. The server never transcodes
//! it just serves bytes, honouring the `Range` header so clients can seek.

use std::io::SeekFrom;
use std::path::Path;
use std::pin::Pin;
use std::task::{Context, Poll};

use axum::body::Body;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::Response;
use tokio::fs::File;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt, ReadBuf};
use tokio_util::io::ReaderStream;

use crate::json_error::json_error;

use crate::ByteMeter;

const CHUNK_BYTES: usize = 64 * 1024;

/// Meters every byte handed to the response body into a [`ByteMeter`]. Socket
/// backpressure drives `poll_read`, so it counts bytes delivered, not read ahead.
pub struct CountingReader<R, M> {
    inner: R,
    meter: M,
}

impl<R, M> CountingReader<R, M> {
    pub fn new(inner: R, meter: M) -> Self {
        Self { inner, meter }
    }
}

impl<R: AsyncRead + Unpin, M: ByteMeter> AsyncRead for CountingReader<R, M> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let before = buf.filled().len();
        let poll = Pin::new(&mut self.inner).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = &poll {
            let n = buf.filled().len() - before;
            if n > 0 {
                self.meter.add(n as u64);
            }
        }
        poll
    }
}

/// A response body that meters into `meter` through a [`CountingReader`], so a
/// body the client abandons counts only what it took.
pub fn metered_body<R, M>(reader: R, meter: M) -> Body
where
    R: AsyncRead + Unpin + Send + 'static,
    M: ByteMeter,
{
    Body::from_stream(ReaderStream::with_capacity(
        CountingReader::new(reader, meter),
        CHUNK_BYTES,
    ))
}

/// Honours `Range: bytes=start-end`: `206 Partial Content` with a
/// `Content-Range` when satisfiable, else a full `200 OK`. Never buffers the
/// whole file. Pass [`crate::Unmetered`] to opt out of bandwidth metering.
pub async fn stream_file<M: ByteMeter>(path: &Path, req_headers: &HeaderMap, meter: M) -> Response {
    let Ok(file) = File::open(path).await else {
        return json_error(StatusCode::NOT_FOUND, "media file not found on disk");
    };
    let Ok(metadata) = file.metadata().await else {
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "could not stat media file",
        );
    };
    stream_reader(
        file,
        metadata.len(),
        content_type_for(path),
        req_headers,
        meter,
    )
    .await
}

/// [`stream_file`] over any seekable reader of `len` bytes.
pub async fn stream_reader<R, M>(
    mut reader: R,
    len: u64,
    content_type: &str,
    req_headers: &HeaderMap,
    meter: M,
) -> Response
where
    R: AsyncRead + AsyncSeek + Unpin + Send + 'static,
    M: ByteMeter,
{
    match parse_range(req_headers, len) {
        RangeOutcome::Full => full_response(reader, len, content_type, meter),
        RangeOutcome::Partial { start, end } => {
            if reader.seek(SeekFrom::Start(start)).await.is_err() {
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "could not seek media file",
                );
            }
            partial_response(reader, start, end, len, content_type, meter)
        }
        RangeOutcome::Unsatisfiable => {
            let mut resp = json_error(
                StatusCode::RANGE_NOT_SATISFIABLE,
                "requested range not satisfiable",
            );
            resp.headers_mut().insert(
                header::CONTENT_RANGE,
                HeaderValue::from_str(&format!("bytes */{}", len))
                    .unwrap_or(HeaderValue::from_static("bytes */0")),
            );
            resp
        }
    }
}

fn full_response<R: AsyncRead + Unpin + Send + 'static, M: ByteMeter>(
    reader: R,
    total_size: u64,
    content_type: &str,
    meter: M,
) -> Response {
    let mut resp = Response::new(metered_body(reader, meter));
    let headers = resp.headers_mut();
    set_common_headers(headers, content_type);
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from(total_size));
    resp
}

// `[start, end]` inclusive, per RFC 7233.
fn partial_response<R: AsyncRead + Unpin + Send + 'static, M: ByteMeter>(
    reader: R,
    start: u64,
    end: u64,
    total_size: u64,
    content_type: &str,
    meter: M,
) -> Response {
    let length = end - start + 1;
    let mut resp = Response::new(metered_body(reader.take(length), meter));
    *resp.status_mut() = StatusCode::PARTIAL_CONTENT;
    let headers = resp.headers_mut();
    set_common_headers(headers, content_type);
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from(length));
    headers.insert(
        header::CONTENT_RANGE,
        HeaderValue::from_str(&format!("bytes {}-{}/{}", start, end, total_size))
            .unwrap_or(HeaderValue::from_static("bytes 0-0/0")),
    );
    resp
}

fn set_common_headers(headers: &mut HeaderMap, content_type: &str) {
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(content_type)
            .unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
}

enum RangeOutcome {
    Full,
    Partial { start: u64, end: u64 },
    Unsatisfiable,
}

fn parse_range(headers: &HeaderMap, total_size: u64) -> RangeOutcome {
    let raw = match headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        Some(r) => r,
        None => return RangeOutcome::Full,
    };

    let spec = match raw.strip_prefix("bytes=") {
        Some(s) => s.trim(),
        None => return RangeOutcome::Full,
    };

    // Reject multi-range; serve the whole file instead of erroring.
    if spec.contains(',') {
        return RangeOutcome::Full;
    }

    if total_size == 0 {
        return RangeOutcome::Unsatisfiable;
    }

    let (start_str, end_str) = match spec.split_once('-') {
        Some(parts) => parts,
        None => return RangeOutcome::Full,
    };

    let last = total_size - 1;

    if start_str.is_empty() {
        // Suffix range: bytes=-N → last N bytes.
        let n: u64 = match end_str.parse() {
            Ok(n) if n > 0 => n,
            _ => return RangeOutcome::Unsatisfiable,
        };
        let start = total_size.saturating_sub(n);
        return RangeOutcome::Partial { start, end: last };
    }

    let start: u64 = match start_str.parse() {
        Ok(s) => s,
        Err(_) => return RangeOutcome::Unsatisfiable,
    };

    if start > last {
        return RangeOutcome::Unsatisfiable;
    }

    let end: u64 = if end_str.is_empty() {
        last
    } else {
        match end_str.parse::<u64>() {
            Ok(e) => e.min(last),
            Err(_) => return RangeOutcome::Unsatisfiable,
        }
    };

    if end < start {
        return RangeOutcome::Unsatisfiable;
    }

    RangeOutcome::Partial { start, end }
}

pub fn content_type_for(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase();

    match ext.as_str() {
        "mp4" | "m4v" => "video/mp4",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "ts" => "video/mp2t",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "ogg" | "oga" => "audio/ogg",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests;
