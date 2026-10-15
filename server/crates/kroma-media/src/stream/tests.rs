use std::io::Cursor;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use super::*;
use crate::Unmetered;

#[derive(Clone, Default)]
struct Delivered(Arc<AtomicU64>);

impl Delivered {
    fn read(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }
}

impl ByteMeter for Delivered {
    fn add(&self, bytes: u64) {
        self.0.fetch_add(bytes, Ordering::Relaxed);
    }
}

async fn served(range: Option<&'static str>) -> (StatusCode, HeaderMap, Vec<u8>) {
    let mut headers = HeaderMap::new();
    if let Some(range) = range {
        headers.insert(header::RANGE, HeaderValue::from_static(range));
    }
    let reader = Cursor::new(b"0123456789".to_vec());
    let response = stream_reader(reader, 10, "video/mp4", &headers, Unmetered).await;
    let (parts, body) = response.into_parts();
    let body = axum::body::to_bytes(body, usize::MAX).await.unwrap();
    (parts.status, parts.headers, body.to_vec())
}

#[tokio::test]
async fn counts_a_chunk_as_it_is_read_and_nothing_beyond_it() {
    let delivered = Delivered::default();
    let mut reader = CountingReader::new(Cursor::new(vec![0u8; 8_192]), delivered.clone());
    let mut taken = [0u8; 1_024];

    reader.read_exact(&mut taken).await.unwrap();

    assert_eq!(delivered.read(), 1_024);
}

#[tokio::test]
async fn a_body_read_to_the_end_counts_every_byte() {
    let delivered = Delivered::default();
    let body = metered_body(Cursor::new(vec![0u8; 40_000]), delivered.clone());

    let read = axum::body::to_bytes(body, usize::MAX).await.unwrap();

    assert_eq!(read.len(), 40_000);
    assert_eq!(delivered.read(), 40_000);
}

#[tokio::test]
async fn a_body_dropped_unread_counts_nothing() {
    let delivered = Delivered::default();
    let body = metered_body(Cursor::new(vec![0u8; 40_000]), delivered.clone());

    drop(body);

    assert_eq!(delivered.read(), 0);
}

#[tokio::test]
async fn a_range_is_answered_with_exactly_the_bytes_it_names() {
    let asked = [
        ("bytes=2-5", "bytes 2-5/10", "2345"),
        ("bytes=7-", "bytes 7-9/10", "789"),
        ("bytes=-3", "bytes 7-9/10", "789"),
        ("bytes=4-99", "bytes 4-9/10", "456789"),
    ];

    let mut answered = Vec::new();
    for (range, ..) in asked {
        answered.push(served(Some(range)).await);
    }

    for ((status, headers, body), (_, content_range, bytes)) in answered.into_iter().zip(asked) {
        assert_eq!(status, StatusCode::PARTIAL_CONTENT);
        assert_eq!(headers[header::CONTENT_RANGE], content_range);
        assert_eq!(body, bytes.as_bytes());
    }
}

#[tokio::test]
async fn a_request_without_a_range_is_answered_with_the_whole_body() {
    let (status, headers, body) = served(None).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers[header::CONTENT_LENGTH], "10");
    assert_eq!(headers[header::ACCEPT_RANGES], "bytes");
    assert_eq!(headers[header::CONTENT_TYPE], "video/mp4");
    assert_eq!(body, b"0123456789");
}

#[tokio::test]
async fn a_range_starting_past_the_end_is_not_satisfiable() {
    let (status, headers, _) = served(Some("bytes=10-20")).await;

    assert_eq!(status, StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(headers[header::CONTENT_RANGE], "bytes */10");
}
