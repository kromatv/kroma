use anyhow::Result;
use kroma_module_host::host_token::ct_eq;
use kroma_module_wire::{LIFECYCLE_HEADER, Lifecycle};

use super::{Header, Request, Response, failed};

const AUTHORIZATION: &str = "authorization";

pub(super) fn answer(request: &Request, declare: fn() -> Result<Lifecycle>) -> Response {
    if !from_the_host(request) {
        return failed(401, "bad host token");
    }
    let (status, body) = match declare().and_then(|lifecycle| Ok(serde_json::to_vec(&lifecycle)?)) {
        Ok(declared) => (200, declared),
        Err(error) => (500, format!("{error:#}").into_bytes()),
    };
    Response {
        status,
        headers: vec![Header {
            name: LIFECYCLE_HEADER.to_string(),
            value: "1".to_string(),
        }],
        body,
    }
}

fn from_the_host(request: &Request) -> bool {
    let Ok(token) = std::env::var("KROMA_HOST_TOKEN") else {
        return false;
    };
    request.headers.iter().any(|header| {
        header.name.eq_ignore_ascii_case(AUTHORIZATION)
            && header
                .value
                .strip_prefix("Bearer ")
                .is_some_and(|given| ct_eq(given.as_bytes(), token.as_bytes()))
    })
}
