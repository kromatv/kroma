//! One call, start to finish: the gate's ruling, curl, and the record the sink
//! hears afterwards.

use std::path::Path;
use std::time::Instant;

use anyhow::{anyhow, Result};

use crate::address::WebTarget;
use crate::curl::run;
use crate::egress::{self, scrubbed, Decision, Exchange, Route, Ruling, BLOCKED};
use crate::pin::public_resolve_line;
use crate::response::Response;

use super::render::{bare_proxy, proxy_lines};
use super::Fetch;

pub(super) struct Call<'a> {
    method: &'static str,
    bytes_out: u64,
    output: Option<&'a Path>,
}

impl<'a> Call<'a> {
    pub(super) fn get() -> Self {
        Self {
            method: "GET",
            bytes_out: 0,
            output: None,
        }
    }

    pub(super) fn download(dest: &'a Path) -> Self {
        Self {
            output: Some(dest),
            ..Self::get()
        }
    }

    pub(super) fn post(bytes_out: u64) -> Self {
        Self {
            method: "POST",
            bytes_out,
            output: None,
        }
    }

    fn bytes_in(&self, response: &Response) -> u64 {
        match self.output {
            Some(path) => std::fs::metadata(path).map_or(0, |meta| meta.len()),
            None => response.body.len() as u64,
        }
    }
}

struct Sent<'a> {
    call: Call<'a>,
    target: Option<WebTarget>,
    rule: Option<String>,
    started: Instant,
}

impl Fetch {
    pub(super) fn send(&self, call: Call<'_>, url: &str, mut config: String) -> Result<Response> {
        let started = Instant::now();
        let (target, Ruling { decision, rule }) = egress::rule_url(self.purpose, call.method, url);
        let sent = Sent {
            call,
            target,
            rule,
            started,
        };
        let proxy = match chosen_proxy(decision, self.socks5.as_deref()) {
            Ok(proxy) => proxy,
            Err(reason) => {
                let refused = Err(anyhow!("{BLOCKED}: {reason}"));
                self.report(sent, Route::Blocked, url, &refused);
                return refused;
            }
        };
        if let Some(proxy) = &proxy {
            config.push_str(&proxy_lines(proxy));
        }
        let outcome = self.pinned(url, config).and_then(run);
        let route = if proxy.is_some() {
            Route::Proxy
        } else {
            Route::Direct
        };
        self.report(sent, route, url, &outcome);
        outcome
    }

    fn pinned(&self, url: &str, mut config: String) -> Result<String> {
        if self.public_only {
            config.push_str(&public_resolve_line(url)?);
        }
        Ok(config)
    }

    fn report(&self, sent: Sent<'_>, route: Route, url: &str, outcome: &Result<Response>) {
        let (host, port) = sent
            .target
            .map_or((String::new(), 0), |target| (target.host, target.port));
        let delivered = route != Route::Blocked;
        egress::record(Exchange {
            purpose: self.purpose,
            method: sent.call.method,
            status: outcome.as_ref().ok().map(|response| response.status),
            bytes_in: outcome
                .as_ref()
                .map_or(0, |response| sent.call.bytes_in(response)),
            bytes_out: if delivered { sent.call.bytes_out } else { 0 },
            duration_ms: u64::try_from(sent.started.elapsed().as_millis()).unwrap_or(u64::MAX),
            error: outcome
                .as_ref()
                .err()
                .map(|error| scrubbed(&format!("{error:#}"), url, &host)),
            rule: sent.rule,
            route,
            host,
            port,
        });
    }
}

pub(super) fn chosen_proxy(
    decision: Decision,
    own: Option<&str>,
) -> Result<Option<String>, String> {
    match decision {
        Decision::Block(reason) => Err(reason),
        Decision::Proxy(proxy) => bare_proxy(&proxy)
            .map(Some)
            .ok_or_else(|| "the network policy named an empty proxy".to_string()),
        Decision::Direct => Ok(own.map(str::to_string)),
    }
}
