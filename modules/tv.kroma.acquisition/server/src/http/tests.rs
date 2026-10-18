use axum::http::StatusCode;

use super::*;

#[test]
fn a_bad_request_carries_its_reason() {
    let resp = bad("nope");

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn blocking_work_that_succeeds_hands_back_its_value() {
    let out = run(|| Ok(7)).await;

    assert_eq!(out.unwrap(), 7);
}

#[tokio::test]
async fn blocking_work_that_fails_answers_a_bad_request_with_the_chain() {
    let out: Result<(), Response> = run(|| Err(anyhow::anyhow!("inner").context("outer"))).await;

    let resp = out.unwrap_err();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let text = String::from_utf8(bytes.to_vec()).unwrap();
    assert!(text.contains("outer: inner"), "{text}");
}

#[tokio::test]
async fn blocking_work_that_panics_answers_a_server_error() {
    let out: Result<(), Response> = run(|| panic!("boom")).await;

    assert_eq!(out.unwrap_err().status(), StatusCode::INTERNAL_SERVER_ERROR);
}
