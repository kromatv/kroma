//! [`Fetch`] inside a WebAssembly component. There is no curl and no socket, so
//! each call is handed to the host as one structured request, and the host rules
//! it and carries it.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock, PoisonError};

use anyhow::{anyhow, Context, Result};
use serde::de::DeserializeOwned;

use super::Fetch;
use crate::multipart::FormPart;
use crate::response::Response;

/// One call a component asks its host to make.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuestCall {
    pub purpose: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
    pub max_time_secs: u32,
    pub max_bytes: Option<u64>,
    pub max_redirects: Option<u8>,
    pub follow_redirects: bool,
    pub public_only: bool,
    pub https_only: bool,
    pub sealed: bool,
    pub http2: bool,
    pub digest: Option<(String, String)>,
}

/// How this component reaches its host.
pub type GuestFetcher = fn(&GuestCall) -> Result<Response>;

/// How this component has its host write a body straight to a file.
pub type GuestDownloader = fn(&GuestCall, &Path) -> Result<Response>;

const MULTIPART_BOUNDARY: &str = "kroma-component-form-boundary";

static FETCHER: OnceLock<GuestFetcher> = OnceLock::new();
static DOWNLOADER: OnceLock<GuestDownloader> = OnceLock::new();
static JARS: Mutex<Option<HashMap<PathBuf, HashMap<String, String>>>> = Mutex::new(None);

/// Give this component's [`Fetch`] calls a way out. Its runtime does this once at
/// start.
pub fn set_guest_fetcher(fetcher: GuestFetcher, downloader: GuestDownloader) {
    let _ = FETCHER.set(fetcher);
    let _ = DOWNLOADER.set(downloader);
}

fn cookie_header(jar: &Path) -> Option<String> {
    let jars = JARS.lock().unwrap_or_else(PoisonError::into_inner);
    let cookies = jars.as_ref()?.get(jar)?;
    let line = cookies
        .iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ");
    (!line.is_empty()).then_some(line)
}

fn keep_cookies(jar: &Path, response: &Response) {
    let mut jars = JARS.lock().unwrap_or_else(PoisonError::into_inner);
    let cookies = jars.get_or_insert_with(HashMap::new).entry(jar.to_path_buf()).or_default();
    for (name, value) in &response.headers {
        if !name.eq_ignore_ascii_case("set-cookie") {
            continue;
        }
        let pair = value.split(';').next().unwrap_or_default();
        if let Some((key, value)) = pair.split_once('=') {
            cookies.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
}

impl Fetch {
    fn call_for(&self, method: &str, url: &str, content_type: Option<&str>, body: Vec<u8>) -> GuestCall {
        let mut headers = self.headers.clone();
        if let Some(content_type) = content_type {
            headers.push(("content-type".to_string(), content_type.to_string()));
        }
        if let Some(cookie) = self.cookie_jar.as_deref().and_then(cookie_header) {
            headers.push(("cookie".to_string(), cookie));
        }
        GuestCall {
            purpose: self.purpose.to_string(),
            method: method.to_string(),
            url: url.to_string(),
            headers,
            body,
            max_time_secs: self.max_time_secs,
            max_bytes: self.max_bytes,
            max_redirects: self.max_redirects,
            follow_redirects: self.follow_redirects,
            public_only: self.public_only,
            https_only: self.https_only,
            sealed: self.socks5.is_some(),
            http2: self.http2,
            digest: self.digest.clone(),
        }
    }

    fn hand_over(&self, method: &str, url: &str, content_type: Option<&str>, body: Vec<u8>) -> Result<Response> {
        let fetcher = FETCHER
            .get()
            .ok_or_else(|| anyhow!("this component has no way out yet"))?;
        let response = fetcher(&self.call_for(method, url, content_type, body))?;
        if let Some(jar) = &self.cookie_jar {
            keep_cookies(jar, &response);
        }
        Ok(response)
    }

    fn with_query(&self, url: &str) -> String {
        if self.query.is_empty() {
            return url.to_string();
        }
        let encoded = form_urlencoded::Serializer::new(String::new())
            .extend_pairs(self.query.iter().map(|(k, v)| (k.as_str(), v.as_str())))
            .finish();
        let separator = if url.contains('?') { '&' } else { '?' };
        format!("{url}{separator}{encoded}")
    }

    pub fn get(&self, url: &str) -> Result<Response> {
        self.hand_over("GET", &self.with_query(url), None, Vec::new())
    }

    /// GET `url` into the file at `dest`, which the host writes: it must be under
    /// a folder this module holds with write access.
    pub fn download(&self, url: &str, dest: &Path) -> Result<Response> {
        let downloader = DOWNLOADER
            .get()
            .ok_or_else(|| anyhow!("this component has no way out yet"))?;
        downloader(&self.call_for("GET", &self.with_query(url), None, Vec::new()), dest)
    }

    pub fn post_json(&self, url: &str, body: &serde_json::Value) -> Result<Response> {
        let body = serde_json::to_vec(body).context("encode the request body")?;
        self.hand_over("POST", url, Some("application/json"), body)
    }

    pub fn put_json(&self, url: &str, body: &serde_json::Value) -> Result<Response> {
        let body = serde_json::to_vec(body).context("encode the request body")?;
        self.hand_over("PUT", url, Some("application/json"), body)
    }

    pub fn delete(&self, url: &str) -> Result<Response> {
        self.hand_over("DELETE", url, None, Vec::new())
    }

    pub fn post_bytes(&self, url: &str, content_type: &str, body: &[u8]) -> Result<Response> {
        self.hand_over("POST", url, Some(content_type), body.to_vec())
    }

    pub fn post_form(&self, url: &str, fields: &[(&str, &str)]) -> Result<Response> {
        let body = form_urlencoded::Serializer::new(String::new())
            .extend_pairs(fields)
            .finish()
            .into_bytes();
        self.hand_over("POST", url, Some("application/x-www-form-urlencoded"), body)
    }

    pub fn post_multipart(&self, url: &str, parts: &[(&str, FormPart<'_>)]) -> Result<Response> {
        let mut body = Vec::new();
        for (name, part) in parts {
            body.extend_from_slice(format!("--{MULTIPART_BOUNDARY}\r\n").as_bytes());
            match part {
                FormPart::Text(value) => {
                    body.extend_from_slice(
                        format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n").as_bytes(),
                    );
                    body.extend_from_slice(value.as_bytes());
                }
                FormPart::File(path) => {
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                    body.extend_from_slice(
                        format!(
                            "Content-Disposition: form-data; name=\"{name}\"; filename=\"{file_name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
                        )
                        .as_bytes(),
                    );
                    body.extend_from_slice(
                        &std::fs::read(path).with_context(|| format!("read {}", path.display()))?,
                    );
                }
            }
            body.extend_from_slice(b"\r\n");
        }
        body.extend_from_slice(format!("--{MULTIPART_BOUNDARY}--\r\n").as_bytes());
        let content_type = format!("multipart/form-data; boundary={MULTIPART_BOUNDARY}");
        self.hand_over("POST", url, Some(&content_type), body)
    }

    pub fn get_json<T: DeserializeOwned>(&self, url: &str) -> Result<T> {
        self.get(url)?.ensure_ok()?.json()
    }
}
