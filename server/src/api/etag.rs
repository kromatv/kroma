//! Conditional reads for the JSON listings: a validator over the body, so a
//! client revisiting an unchanged list is answered `304` without one.

use axum::body::{to_bytes, Body};
use axum::extract::Request;
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use twox_hash::XxHash3_128;

use crate::api::error::json_error;

/// Tag a `200` JSON answer to a `GET` with a weak `ETag` and `Cache-Control:
/// private, no-cache`, and answer `304 Not Modified` when `If-None-Match`
/// already names it. The tag hashes the body the handler built, so a revisit
/// saves the transfer and its compression, not the work behind it, and one
/// viewer's tag never matches a body built for another.
pub async fn revalidate(req: Request, next: Next) -> Response {
    if req.method() != Method::GET {
        return next.run(req).await;
    }
    let held = req.headers().get(header::IF_NONE_MATCH).cloned();
    let res = next.run(req).await;
    if res.status() != StatusCode::OK || !is_json(res.headers()) {
        return res;
    }
    let (mut parts, body) = res.into_parts();
    let Ok(bytes) = to_bytes(body, usize::MAX).await else {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "response body failed");
    };
    let tag = weak_tag(&bytes);
    let revisit = held.as_ref().is_some_and(|held| names(held, &tag));
    parts.headers.insert(header::ETAG, tag);
    parts.headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-cache"),
    );
    if !revisit {
        return Response::from_parts(parts, Body::from(bytes));
    }
    parts.status = StatusCode::NOT_MODIFIED;
    parts.headers.remove(header::CONTENT_TYPE);
    parts.headers.remove(header::CONTENT_LENGTH);
    Response::from_parts(parts, Body::empty())
}

// A validator, not a signature: XXH3 hashes a 14 MB listing in under a
// millisecond, a hundred times faster than SHA-256 on the same body.
fn weak_tag(body: &[u8]) -> HeaderValue {
    let digest = XxHash3_128::oneshot(body);
    HeaderValue::try_from(format!("W/\"{digest:032x}\""))
        .expect("a quoted hex digest is a valid header value")
}

// RFC 9110 §13.1.2: If-None-Match compares weakly, and `*` matches any
// representation the resource has.
fn names(held: &HeaderValue, tag: &HeaderValue) -> bool {
    let (Ok(held), Ok(tag)) = (held.to_str(), tag.to_str()) else {
        return false;
    };
    let ours = opaque(tag);
    held.split(',')
        .map(str::trim)
        .any(|candidate| candidate == "*" || opaque(candidate) == ours)
}

fn opaque(tag: &str) -> &str {
    tag.strip_prefix("W/").unwrap_or(tag)
}

fn is_json(headers: &HeaderMap) -> bool {
    headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("application/json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn value(s: &str) -> HeaderValue {
        HeaderValue::from_str(s).unwrap()
    }

    #[test]
    fn the_same_body_is_given_the_same_tag() {
        let first = weak_tag(br#"[{"id":"m1"}]"#);

        let again = weak_tag(br#"[{"id":"m1"}]"#);

        assert_eq!(first, again);
        assert!(first.to_str().unwrap().starts_with("W/\""));
    }

    #[test]
    fn another_body_is_given_another_tag() {
        let first = weak_tag(br#"[{"id":"m1"}]"#);

        let other = weak_tag(br#"[{"id":"m2"}]"#);

        assert_ne!(first, other);
    }

    #[test]
    fn a_held_tag_matches_with_or_without_its_weak_prefix() {
        let tag = weak_tag(b"[]");
        let strong = tag.to_str().unwrap().trim_start_matches("W/").to_string();

        assert!(names(&tag, &tag));
        assert!(names(&value(&strong), &tag));
    }

    #[test]
    fn a_list_of_held_tags_matches_when_any_of_them_does() {
        let tag = weak_tag(b"[]");
        let held = format!("W/\"stale\", {}", tag.to_str().unwrap());

        assert!(names(&value(&held), &tag));
        assert!(names(&value("*"), &tag));
        assert!(!names(&value("W/\"stale\""), &tag));
    }
}
