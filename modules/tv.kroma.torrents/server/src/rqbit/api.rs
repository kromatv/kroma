//! rqbit's HTTP API: the calls this module makes and the JSON it reads back.

use std::net::SocketAddr;

use anyhow::{Result, anyhow};
use base64::Engine as _;
use kroma_module_sdk::http::{Fetch, Response};
use serde::Serialize;

use super::wire::{Added, Details, Listed, PeersAdded, Refusal, Root, Rows};

use crate::torrent_file::encode;

pub(super) const AUTH_ENV: &str = "RQBIT_HTTP_BASIC_AUTH_USERPASS";
pub(super) const TIMEOUT_HEADER: &str = "x-req-timeout-ms";
pub(super) const OUTLIVES_THE_CALLER_MS: u32 = 5_000;

const PURPOSE: &str = "engine-api";
const USER: &str = "kroma";
const QUICK_SECS: u32 = 5;
const ADD_SECS: u32 = 15;
const NOT_FOUND: u16 = 404;

pub(super) fn user_pass(password: &str) -> String {
    format!("{USER}:{password}")
}

#[derive(Clone)]
pub(super) struct Api {
    base: String,
    user_pass: String,
    authorization: String,
}

impl std::fmt::Debug for Api {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Api")
            .field("base", &self.base)
            .finish_non_exhaustive()
    }
}

#[derive(Serialize)]
struct Limits {
    download_bps: Option<u32>,
    upload_bps: Option<u32>,
}

/// One `POST /torrents`, as its query string says it.
#[derive(Debug, Clone, Default)]
pub(super) struct AddOptions<'a> {
    pub output_folder: Option<&'a str>,
    pub only_files: Option<&'a [usize]>,
    pub initial_peers: &'a [SocketAddr],
    pub list_only: bool,
    pub is_url: bool,
}

impl AddOptions<'_> {
    pub(super) fn query(&self) -> String {
        let mut query = vec![format!("is_url={}", self.is_url)];
        if self.list_only {
            query.push("list_only=true".to_string());
        } else {
            query.push("overwrite=true".to_string());
        }
        if let Some(folder) = self.output_folder {
            query.push(format!("output_folder={}", encode(folder)));
        }
        if let Some(files) = self.only_files.filter(|files| !files.is_empty()) {
            let files: Vec<String> = files.iter().map(ToString::to_string).collect();
            query.push(format!("only_files={}", encode(&files.join(","))));
        }
        if !self.initial_peers.is_empty() {
            let peers: Vec<String> = self.initial_peers.iter().map(ToString::to_string).collect();
            query.push(format!("initial_peers={}", encode(&peers.join(","))));
        }
        query.join("&")
    }
}

fn refusal_of(response: &Response) -> anyhow::Error {
    match response.json::<Refusal>() {
        Ok(refusal) => anyhow!("{}", refusal.human_readable),
        Err(_) => anyhow!("rqbit answered HTTP {}", response.status),
    }
}

fn is_ok(response: &Response) -> bool {
    (200..300).contains(&response.status)
}

fn checked(response: Response) -> Result<Response> {
    if is_ok(&response) {
        Ok(response)
    } else {
        Err(refusal_of(&response))
    }
}

impl Api {
    pub(super) fn new(port: u16, password: &str) -> Self {
        let user_pass = user_pass(password);
        let authorization = format!(
            "Basic {}",
            base64::engine::general_purpose::STANDARD.encode(&user_pass)
        );
        Self {
            base: format!("http://127.0.0.1:{port}"),
            user_pass,
            authorization,
        }
    }

    pub(super) fn url(&self, path_and_query: &str) -> String {
        format!("{}{path_and_query}", self.base)
    }

    pub(super) fn credentials(&self) -> &str {
        &self.user_pass
    }

    fn fetch(&self, secs: u32) -> Fetch {
        Fetch::new()
            .purpose(PURPOSE)
            .max_time(secs)
            .no_redirects()
            .header("authorization", self.authorization.clone())
    }

    pub(super) fn version(&self) -> Result<String> {
        let response = checked(self.fetch(QUICK_SECS).get(&self.url("/"))?)?;
        Ok(response.json::<Root>()?.version)
    }

    pub(super) fn list(&self) -> Result<Vec<Listed>> {
        let url = self.url("/torrents?with_stats=true");
        Ok(checked(self.fetch(QUICK_SECS).get(&url)?)?
            .json::<Rows>()?
            .torrents)
    }

    pub(super) fn details(&self, client_ref: &str) -> Result<Details> {
        let url = self.url(&format!("/torrents/{client_ref}"));
        checked(self.fetch(QUICK_SECS).get(&url)?)?.json()
    }

    /// Whether the engine holds this torrent. A failed call is an error, because
    /// an answer of no costs the caller its row.
    pub(super) fn holds(&self, client_ref: &str) -> Result<bool> {
        let url = self.url(&format!("/torrents/{client_ref}"));
        let response = self.fetch(QUICK_SECS).get(&url)?;
        if response.status == NOT_FOUND {
            return Ok(false);
        }
        checked(response).map(|_| true)
    }

    /// `POST /torrents`, for what answers at once: `.torrent` bytes, or a listing
    /// bounded by this call's budget.
    pub(super) fn add(&self, body: &[u8], options: &AddOptions<'_>) -> Result<Added> {
        let url = self.url(&format!("/torrents?{}", options.query()));
        let fetch = self.fetch(ADD_SECS).header(
            TIMEOUT_HEADER,
            (ADD_SECS * 1000 + OUTLIVES_THE_CALLER_MS).to_string(),
        );
        checked(fetch.post_bytes(&url, "application/octet-stream", body)?)?.json()
    }

    fn act(&self, client_ref: &str, action: &str) -> Result<()> {
        let url = self.url(&format!("/torrents/{client_ref}/{action}"));
        checked(self.fetch(QUICK_SECS).post_bytes(&url, "text/plain", b"")?).map(|_| ())
    }

    pub(super) fn pause(&self, client_ref: &str) -> Result<()> {
        self.act(client_ref, "pause")
    }

    pub(super) fn start(&self, client_ref: &str) -> Result<()> {
        self.act(client_ref, "start")
    }

    pub(super) fn forget(&self, client_ref: &str) -> Result<()> {
        self.act(client_ref, "forget")
    }

    pub(super) fn delete(&self, client_ref: &str) -> Result<()> {
        self.act(client_ref, "delete")
    }

    pub(super) fn add_peers(&self, client_ref: &str, peers: &[SocketAddr]) -> Result<usize> {
        let url = self.url(&format!("/torrents/{client_ref}/add_peers"));
        let body: Vec<String> = peers.iter().map(ToString::to_string).collect();
        let response =
            self.fetch(QUICK_SECS)
                .post_bytes(&url, "text/plain", body.join("\n").as_bytes())?;
        Ok(checked(response)?.json::<PeersAdded>()?.added)
    }

    pub(super) fn set_limits(
        &self,
        download_bps: Option<u32>,
        upload_bps: Option<u32>,
    ) -> Result<()> {
        let url = self.url("/torrents/limits");
        let body = serde_json::to_value(Limits {
            download_bps,
            upload_bps,
        })?;
        checked(self.fetch(QUICK_SECS).post_json(&url, &body)?).map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_query_says_what_the_add_asks_for_and_encodes_it() {
        let peers: Vec<SocketAddr> = vec![
            "1.2.3.4:6881".parse().unwrap(),
            "[::1]:6882".parse().unwrap(),
        ];
        let options = AddOptions {
            output_folder: Some("/data/a b"),
            only_files: Some(&[0, 2]),
            initial_peers: &peers,
            list_only: false,
            is_url: true,
        };

        assert_eq!(
            options.query(),
            "is_url=true&overwrite=true&output_folder=%2Fdata%2Fa%20b&only_files=0%2C2&initial_peers=1.2.3.4%3A6881%2C%5B%3A%3A1%5D%3A6882"
        );
    }

    #[test]
    fn a_listing_never_overwrites_and_an_empty_selection_is_no_selection() {
        let options = AddOptions {
            only_files: Some(&[]),
            list_only: true,
            ..AddOptions::default()
        };

        assert_eq!(options.query(), "is_url=false&list_only=true");
    }

    #[test]
    fn a_debug_print_of_the_client_holds_no_credential() {
        let api = Api::new(1234, "hunter2");

        let printed = format!("{api:?}");

        assert!(printed.contains("127.0.0.1:1234"), "{printed}");
        assert!(!printed.contains("hunter2"), "{printed}");
        assert!(!printed.contains(&api.authorization), "{printed}");
    }
}
