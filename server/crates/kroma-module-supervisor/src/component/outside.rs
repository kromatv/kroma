//! The two ways out every component has: `net.fetch`, which takes the same route
//! as any module's call, and the host API, reached with a token it never holds.

use std::path::Path;
use std::sync::Arc;

use kroma_http::egress::{Gateway, BLOCKED};
use kroma_http::{loopback, Fetch, Loopback};
use kroma_module_host::{NetworkAction, NetworkAsk, NetworkFlow, NetworkPolicy, NetworkRoute};
use kroma_wasm_host::{FetchRequest, Header, NetPolicy, Preopen, Request, Response, Verdict};

const HOST_API_PREFIX: &str = "/api/_host/";
const PEER_PREFIX: &str = "/api/module/";
const AUTHORIZATION: &str = "authorization";
const CALL_MAX_TIME_SECS: u32 = 300;

pub(super) struct Outside {
    pub(super) module: String,
    pub(super) token: String,
    pub(super) host_socket: std::path::PathBuf,
    pub(super) gateway: Gateway,
    pub(super) network: Arc<dyn NetworkPolicy>,
    pub(super) no_network: bool,
    pub(super) roots: Vec<Preopen>,
}

fn header_pairs(headers: &[Header]) -> impl Iterator<Item = (&str, &str)> {
    headers
        .iter()
        .map(|header| (header.name.as_str(), header.value.as_str()))
}

fn response_of(response: kroma_http::Response) -> Response {
    Response {
        status: response.status,
        headers: response
            .headers
            .into_iter()
            .map(|(name, value)| Header { name, value })
            .collect(),
        body: response.body,
    }
}

impl Outside {
    fn journal_refusal(&self, request: &FetchRequest, host: &str, port: u16, rule: Option<String>, reason: &str) {
        self.network.record_flows(
            &self.module,
            vec![NetworkFlow {
                purpose: request.purpose.clone(),
                method: request.method.clone(),
                host: host.to_string(),
                port,
                route: NetworkRoute::Blocked,
                status: None,
                bytes_in: 0,
                bytes_out: 0,
                duration_ms: 0,
                error: Some(reason.to_string()),
                rule,
                carried: false,
            }],
        );
    }

    fn annotate(&self, request: &FetchRequest, host: &str, port: u16, outcome: &anyhow::Result<kroma_http::Response>) {
        self.network.record_flows(
            &self.module,
            vec![NetworkFlow {
                purpose: request.purpose.clone(),
                method: request.method.clone(),
                host: host.to_string(),
                port,
                route: NetworkRoute::Direct,
                status: outcome.as_ref().ok().map(|response| response.status),
                bytes_in: 0,
                bytes_out: 0,
                duration_ms: 0,
                error: outcome.as_ref().err().map(|error| format!("{error:#}")),
                rule: None,
                carried: true,
            }],
        );
    }

    fn carried(request: &FetchRequest) -> Fetch {
        let mut fetch = Fetch::new().max_time(request.max_time_secs);
        for (name, value) in header_pairs(&request.headers) {
            fetch = fetch.header(name, value);
        }
        if let Some(bytes) = request.max_bytes {
            fetch = fetch.max_bytes(bytes);
        }
        if let Some(hops) = request.max_redirects {
            fetch = fetch.max_redirects(hops);
        }
        if !request.follow_redirects || request.public_only {
            fetch = fetch.no_redirects();
        }
        if request.https_only {
            fetch = fetch.https_only();
        }
        if request.http2 {
            fetch = fetch.http2();
        }
        if let Some((user, password)) = &request.digest {
            fetch = fetch.digest(user, password.clone());
        }
        fetch
    }

    // Decided the way a fetch is, and journaled when it is refused.
    fn refusal(&self, request: &FetchRequest, target: &kroma_http::address::WebTarget) -> Option<String> {
        let answer = self.network.decide(
            &self.module,
            &NetworkAsk {
                purpose: request.purpose.clone(),
                method: request.method.clone(),
                host: target.host.clone(),
                port: target.port,
                https: target.https,
                sealed: request.sealed,
            },
        );
        if answer.action == NetworkAction::Block {
            let reason = answer.reason.unwrap_or_else(|| "refused by the core".to_string());
            self.journal_refusal(request, &target.host, target.port, answer.rule, &reason);
            return Some(format!("{BLOCKED}: {reason}"));
        }
        self.no_network.then(|| {
            format!("{BLOCKED}: a contained module that declares no permissions has no network")
        })
    }

    fn holds_for_writing(&self, path: &Path) -> bool {
        super::files::is_within(path, &self.roots, true)
    }
}

impl NetPolicy for Outside {
    fn fetch(&self, request: &FetchRequest) -> Verdict {
        let Some(target) = kroma_http::address::web_target(&request.url) else {
            return Verdict::Block(format!("{BLOCKED}: not a plain http or https URL"));
        };
        if let Some(reason) = self.refusal(request, &target) {
            return Verdict::Block(reason);
        }
        let username = Gateway::username(&request.purpose, request.public_only, request.sealed);
        let outcome = Self::carried(request).carry(
            &self.gateway,
            &username,
            &request.method,
            &request.url,
            &request.body,
        );
        self.annotate(request, &target.host, target.port, &outcome);
        match outcome {
            Ok(response) => Verdict::Allow(response_of(response)),
            Err(error) => Verdict::Block(format!("{error:#}")),
        }
    }

    fn download(&self, request: &FetchRequest, destination: &str) -> Verdict {
        let Some(target) = kroma_http::address::web_target(&request.url) else {
            return Verdict::Block(format!("{BLOCKED}: not a plain http or https URL"));
        };
        let path = Path::new(destination);
        if !self.holds_for_writing(path) {
            return Verdict::Block(format!("{destination} is not in a folder this module may write"));
        }
        if let Some(reason) = self.refusal(request, &target) {
            return Verdict::Block(reason);
        }
        let username = Gateway::username(&request.purpose, request.public_only, request.sealed);
        let outcome = Self::carried(request).carry_download(&self.gateway, &username, &request.url, path);
        self.annotate(request, &target.host, target.port, &outcome);
        match outcome {
            Ok(response) => Verdict::Allow(response_of(response)),
            Err(error) => Verdict::Block(format!("{error:#}")),
        }
    }

    fn host_api(&self, request: &Request) -> Result<Response, String> {
        let to_core = request.path.starts_with(HOST_API_PREFIX);
        if !to_core && !request.path.starts_with(PEER_PREFIX) {
            return Err(format!("{} is not the host's to answer", request.path));
        }
        let mut call = Loopback::new().max_time(CALL_MAX_TIME_SECS);
        let mut content_type = "application/octet-stream".to_string();
        for (name, value) in header_pairs(&request.headers) {
            if name.eq_ignore_ascii_case("content-type") {
                content_type = value.to_string();
            } else if !(to_core && name.eq_ignore_ascii_case(AUTHORIZATION)) {
                call = call.header(name, value);
            }
        }
        if to_core {
            call = call.header(AUTHORIZATION, format!("Bearer {}", self.token));
        }
        let url = format!("{}{}", loopback::unix_url(&self.host_socket), request.path);
        let answered = if request.method == "GET" {
            call.get(&url)
        } else {
            call.post_bytes(&url, &content_type, &request.body)
        };
        answered.map(response_of).map_err(|error| format!("{error:#}"))
    }
}

