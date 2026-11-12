//! [`Fetch`]'s executors in a process that can start curl.

use std::path::Path;

use anyhow::{Context, Result};
use serde::de::DeserializeOwned;

use crate::config::{header_line, option_line};
use crate::multipart::FormPart;
use crate::response::Response;

use super::send::Call;
use super::Fetch;

impl Fetch {
    /// Make a `method` call on a component's behalf through its gateway, as
    /// `username`. The gateway rules on it and files it, so neither this process's
    /// gate nor its sink hears about it.
    pub fn carry(
        &self,
        gateway: &crate::egress::Gateway,
        username: &str,
        method: &str,
        url: &str,
        body: &[u8],
    ) -> Result<Response> {
        use std::io::Write;

        let mut config = self.base_config();
        config.push_str(&super::render::gateway_lines(gateway, username));
        config.push_str(&option_line("request", method));
        let mut file = None;
        if !body.is_empty() {
            let mut held = tempfile::Builder::new()
                .prefix("kroma-http-body-")
                .tempfile()
                .context("create the curl request body")?;
            held.write_all(body).context("write the curl request body")?;
            held.flush().context("write the curl request body")?;
            config.push_str(&option_line(
                "data-binary",
                &format!("@{}", held.path().display()),
            ));
            file = Some(held);
        }
        config.push_str(&option_line("url", url));
        let outcome = crate::curl::run(config);
        drop(file);
        outcome
    }

    /// [`Self::carry`] for a GET whose body goes to the file at `dest`.
    pub fn carry_download(
        &self,
        gateway: &crate::egress::Gateway,
        username: &str,
        url: &str,
        dest: &Path,
    ) -> Result<Response> {
        let mut config = self.base_config();
        config.push_str(&super::render::gateway_lines(gateway, username));
        config.push_str(&option_line("output", &dest.to_string_lossy()));
        config.push_str(&option_line("url", url));
        crate::curl::run(config)
    }

    pub fn get(&self, url: &str) -> Result<Response> {
        let mut config = self.base_config();
        if !self.query.is_empty() {
            config.push_str("get\n");
            for (k, v) in &self.query {
                config.push_str(&option_line("data-urlencode", &format!("{k}={v}")));
            }
        }
        config.push_str(&option_line("url", url));
        self.send(Call::get(), url, config)
    }

    /// GET `url` into the file at `dest` rather than into memory, for a body
    /// too large to hold. The response carries the status and headers and an
    /// empty body; `dest` holds whatever was sent, an error page included, so
    /// check the status before keeping it.
    pub fn download(&self, url: &str, dest: &Path) -> Result<Response> {
        let mut config = self.base_config();
        config.push_str(&option_line("output", &dest.to_string_lossy()));
        config.push_str(&option_line("url", url));
        self.send(Call::download(dest), url, config)
    }

    pub fn post_json(&self, url: &str, body: &serde_json::Value) -> Result<Response> {
        let body = serde_json::to_string(body)?;
        let mut config = self.base_config();
        config.push_str(&header_line("content-type", "application/json"));
        config.push_str(&option_line("data-binary", &body));
        config.push_str(&option_line("url", url));
        self.send(Call::post(body.len() as u64), url, config)
    }

    /// PUT a JSON body.
    pub fn put_json(&self, url: &str, body: &serde_json::Value) -> Result<Response> {
        let body = serde_json::to_string(body)?;
        let sent = body.len() as u64;
        self.send(Call::put(sent), url, self.put_json_config(url, &body))
    }

    /// DELETE `url`, with no body.
    pub fn delete(&self, url: &str) -> Result<Response> {
        self.send(Call::delete(), url, self.delete_config(url))
    }

    /// POST a raw byte body (Web Push's `aes128gcm` ciphertext).
    ///
    /// The bytes go through a temp file, not an argv entry: an encrypted body is
    /// arbitrary binary, and a command-line argument cannot carry a NUL and
    /// would be mangled by any non-UTF-8 byte.
    pub fn post_bytes(&self, url: &str, content_type: &str, body: &[u8]) -> Result<Response> {
        use std::io::Write;

        let mut file = tempfile::Builder::new()
            .prefix("kroma-http-body-")
            .tempfile()
            .context("create the curl request body")?;
        file.write_all(body)
            .context("write the curl request body")?;
        file.flush().context("write the curl request body")?;

        let mut config = self.base_config();
        config.push_str(&header_line("content-type", content_type));
        config.push_str(&option_line(
            "data-binary",
            &format!("@{}", file.path().display()),
        ));
        config.push_str(&option_line("url", url));
        self.send(Call::post(body.len() as u64), url, config)
    }

    /// `application/x-www-form-urlencoded` POST (qBittorrent login/actions).
    /// With no fields it is a POST with an empty body rather than a GET, which
    /// is what Roku's ECP wants: the arguments in the query string, nothing else.
    pub fn post_form(&self, url: &str, fields: &[(&str, &str)]) -> Result<Response> {
        let sent = fields
            .iter()
            .map(|(k, v)| (k.len() + v.len() + 1) as u64)
            .sum();
        self.send(Call::post(sent), url, self.form_config(url, fields))
    }

    /// `multipart/form-data` POST (Roku's developer installer takes the channel
    /// zip this way).
    pub fn post_multipart(&self, url: &str, parts: &[(&str, FormPart<'_>)]) -> Result<Response> {
        let sent = parts.iter().map(|(_, part)| part.size()).sum();
        self.send(Call::post(sent), url, self.multipart_config(url, parts))
    }

    /// GET expecting a 2xx JSON body; the common happy path in one call.
    pub fn get_json<T: DeserializeOwned>(&self, url: &str) -> Result<T> {
        self.get(url)?.ensure_ok()?.json()
    }
}
