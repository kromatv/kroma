//! Each module's way out: a SOCKS5 gateway on loopback, answering only that
//! module's token and ruled by the core's network policy.

use std::sync::{Arc, OnceLock};

use kroma_egress::{Flow, Policy, Request, Route, Ruling, Upstream, Verdict};
use kroma_module_host::host_token::ct_eq;
use kroma_module_host::{
    NetworkAction, NetworkAnswer, NetworkAsk, NetworkFlow, NetworkPolicy, NetworkPolicyOf,
    NetworkRoute,
};
use tokio::runtime::Handle;
use tokio::task::AbortHandle;

use super::component::FolderRoots;
use super::Supervisor;

const CARRIED_METHOD: &str = "CONNECT";
const PERMISSION_NET_CONNECT: &str = "permission:net.connect";
const NOTHING_DECLARED: &str = "a contained module that declares no permissions has no network";

pub(crate) struct Wiring {
    pub(crate) network: NetworkPolicyOf,
    pub(crate) runtime: Handle,
    folders: FolderRoots,
}

impl Wiring {
    pub(crate) fn folders(&self) -> &FolderRoots {
        &self.folders
    }
}

/// What a running module holds on the runtime: its gateway, its socket and its
/// ticks. It lets go of them when dropped, and connections already relayed finish
/// on their own.
pub(crate) struct Running {
    pub(crate) tasks: Vec<AbortHandle>,
}

impl Drop for Running {
    fn drop(&mut self) {
        for task in &self.tasks {
            task.abort();
        }
    }
}

pub(crate) type Slot = OnceLock<Wiring>;

impl Supervisor {
    /// Give every module started from here on a gateway ruled by `network`,
    /// served on `runtime`. `folders` answers where the named folder roots are. A
    /// supervisor never told this starts no module.
    pub fn serve_gateways(&self, network: NetworkPolicyOf, runtime: Handle, folders: FolderRoots) {
        let wired = self.gateway.set(Wiring {
            network,
            runtime,
            folders,
        });
        if wired.is_err() {
            tracing::warn!("the module gateways were wired twice; keeping the first");
        }
    }
}

pub(crate) struct ModulePolicy {
    pub(crate) module: String,
    pub(crate) token: String,
    pub(crate) network: Arc<dyn NetworkPolicy>,
    pub(crate) no_network: bool,
}

impl Policy for ModulePolicy {
    fn caller_of(&self, credential: &str) -> Option<String> {
        ct_eq(self.token.as_bytes(), credential.as_bytes()).then(|| self.module.clone())
    }

    fn decide(&self, request: &Request) -> Ruling {
        if self.no_network {
            return Ruling {
                verdict: Verdict::Block(NOTHING_DECLARED.to_string()),
                rule: Some(PERMISSION_NET_CONNECT.to_string()),
            };
        }
        let asked = Username::parse(&request.purpose);
        let answer = self.network.decide(
            &self.module,
            &NetworkAsk {
                purpose: asked.purpose.to_string(),
                method: CARRIED_METHOD.to_string(),
                host: request.host.to_string(),
                port: request.port,
                https: request.port == 443,
                sealed: asked.sealed,
            },
        );
        ruling_of(answer, asked.public_only)
    }

    fn record(&self, flow: Flow) {
        let purpose = Username::parse(&flow.purpose).purpose.to_string();
        let route = match flow.route {
            Route::Direct => NetworkRoute::Direct,
            Route::Upstream => NetworkRoute::Proxy,
            Route::Blocked => NetworkRoute::Blocked,
        };
        self.network.record_flows(
            &self.module,
            vec![NetworkFlow {
                purpose,
                method: CARRIED_METHOD.to_string(),
                host: flow.host,
                port: flow.port,
                route,
                status: None,
                bytes_in: flow.bytes_down,
                bytes_out: flow.bytes_up,
                duration_ms: u64::try_from(flow.duration.as_millis()).unwrap_or(u64::MAX),
                error: flow.error,
                rule: flow.rule,
                carried: false,
            }],
        );
    }
}

fn ruling_of(answer: NetworkAnswer, public_only: bool) -> Ruling {
    let verdict = match answer.action {
        NetworkAction::Direct => Verdict::Direct {
            private_allowed: answer.private_allowed && !public_only,
        },
        NetworkAction::Vpn => answer.proxy.as_deref().and_then(upstream_of).map_or_else(
            || Verdict::Block("the core routed this call to a VPN it did not name".to_string()),
            Verdict::Upstream,
        ),
        NetworkAction::Block => Verdict::Block(
            answer
                .reason
                .unwrap_or_else(|| "refused by the core".to_string()),
        ),
    };
    Ruling {
        verdict,
        rule: answer.rule,
    }
}

struct Username<'a> {
    purpose: &'a str,
    public_only: bool,
    sealed: bool,
}

impl<'a> Username<'a> {
    fn parse(username: &'a str) -> Self {
        let mut parsed = Self {
            purpose: username,
            public_only: false,
            sealed: false,
        };
        while let Some((purpose, flag)) = parsed.purpose.rsplit_once('.') {
            match flag {
                "public" => parsed.public_only = true,
                "vpn" => parsed.sealed = true,
                _ => break,
            }
            parsed.purpose = purpose;
        }
        parsed
    }
}

fn upstream_of(url: &str) -> Option<Upstream> {
    let bare = url.trim().split_once("://").map_or(url.trim(), |(_, rest)| rest);
    let (credentials, address) = match bare.rsplit_once('@') {
        Some((userinfo, address)) => {
            let (username, password) = userinfo.split_once(':')?;
            (
                Some((username.to_string(), password.to_string())),
                address,
            )
        }
        None => (None, bare),
    };
    (!address.is_empty()).then(|| Upstream {
        address: address.to_string(),
        credentials,
    })
}

#[cfg(test)]
mod tests;
