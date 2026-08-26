use std::time::Duration;

use anyhow::Result;

use crate::response::Response;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
}

impl Method {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Get => "GET",
            Self::Post => "POST",
        }
    }
}

#[derive(Debug)]
pub struct Request<'a> {
    pub method: Method,
    pub url: &'a str,
    pub headers: &'a [(String, String)],
    /// `(content-type, bytes)`, absent on a GET.
    pub body: Option<(&'a str, &'a [u8])>,
    pub timeout: Duration,
}

/// A way for one KROMA process to reach another.
///
/// [`Transport::send`] blocks the calling thread. An implementation built on
/// async internals owns that bridge itself.
pub trait Transport: Send + Sync + 'static {
    fn name(&self) -> &'static str;

    fn accepts(&self, url: &str) -> bool;

    fn send(&self, request: &Request<'_>) -> Result<Response>;
}
