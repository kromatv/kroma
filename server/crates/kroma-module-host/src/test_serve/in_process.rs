use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::task::{Context, Poll, Waker};

use anyhow::{anyhow, Result};
use axum::body::Body;
use axum::Router;
use kroma_http::loopback::{register, Request, Transport, MAX_BODY_BYTES};
use kroma_http::Response;
use tower::ServiceExt;

const MAX_POLLS: usize = 100_000;
const STUCK: &str = "an in-process route waited on something this one thread cannot drive";

static MOUNTED: AtomicUsize = AtomicUsize::new(0);

type Answer = Pin<Box<dyn Future<Output = Result<Response>> + Send>>;

struct InProcess {
    base: String,
    app: Router,
}

pub(super) fn mount(app: Router) -> String {
    let base = format!(
        "http://test-serve-{}.invalid",
        MOUNTED.fetch_add(1, Ordering::Relaxed)
    );
    register(Arc::new(InProcess {
        base: base.clone(),
        app,
    }));
    base
}

fn finish_together(mut answers: Vec<Answer>) -> Vec<Result<Response>> {
    let mut finished: Vec<Option<Result<Response>>> = answers.iter().map(|_| None).collect();
    let mut context = Context::from_waker(Waker::noop());
    for _ in 0..MAX_POLLS {
        for (answer, slot) in answers.iter_mut().zip(&mut finished) {
            if slot.is_none() {
                if let Poll::Ready(response) = answer.as_mut().poll(&mut context) {
                    *slot = Some(response);
                }
            }
        }
        if finished.iter().all(Option::is_some) {
            break;
        }
    }
    finished
        .into_iter()
        .map(|slot| slot.unwrap_or_else(|| Err(anyhow!(STUCK))))
        .collect()
}

async fn answer(app: Router, request: axum::http::Request<Body>) -> Result<Response> {
    let (parts, body) = app.oneshot(request).await?.into_parts();
    let body = axum::body::to_bytes(body, MAX_BODY_BYTES).await?;
    Ok(Response {
        status: parts.status.as_u16(),
        headers: parts
            .headers
            .iter()
            .map(|(name, value)| {
                (
                    name.to_string(),
                    value.to_str().unwrap_or_default().to_string(),
                )
            })
            .collect(),
        body: body.to_vec(),
    })
}

impl InProcess {
    fn request_of(&self, request: &Request<'_>) -> Result<axum::http::Request<Body>> {
        let path = request.url.strip_prefix(&self.base).unwrap_or_default();
        let mut built = axum::http::Request::builder()
            .method(request.method.as_str())
            .uri(if path.is_empty() { "/" } else { path });
        for (name, value) in request.headers {
            built = built.header(name.as_str(), value.as_str());
        }
        let body = match request.body {
            Some((content_type, bytes)) => {
                built = built.header("content-type", content_type);
                Body::from(bytes.to_vec())
            }
            None => Body::empty(),
        };
        Ok(built.body(body)?)
    }

    fn answer_to(&self, request: &Request<'_>) -> Answer {
        match self.request_of(request) {
            Ok(request) => Box::pin(answer(self.app.clone(), request)),
            Err(error) => Box::pin(std::future::ready(Err(error))),
        }
    }
}

impl Transport for InProcess {
    fn name(&self) -> &'static str {
        "in-process test server"
    }

    fn accepts(&self, url: &str) -> bool {
        url.strip_prefix(&self.base)
            .is_some_and(|path| path.is_empty() || path.starts_with('/'))
    }

    fn send(&self, request: &Request<'_>) -> Result<Response> {
        finish_together(vec![self.answer_to(request)])
            .pop()
            .unwrap_or_else(|| Err(anyhow!(STUCK)))
    }

    fn send_all(&self, requests: &[Request<'_>]) -> Vec<Result<Response>> {
        finish_together(
            requests
                .iter()
                .map(|request| self.answer_to(request))
                .collect(),
        )
    }
}
