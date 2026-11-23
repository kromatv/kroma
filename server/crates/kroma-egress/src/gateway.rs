//! Accepting callers, dialling what the policy allows, relaying the bytes and
//! reporting each connection.

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::{TcpListener, TcpStream};

use kroma_http::address::is_public;

use crate::lan::{self, LocalNetwork};
use crate::protocol::{accept_credentials, answer_credentials, read_connect, reply, Reply};
use crate::{upstream, Flow, Host, Policy, Reach, Request, Route, Ruling, Verdict};

const HANDSHAKE_BUDGET: Duration = Duration::from_secs(10);
const CONNECT_BUDGET: Duration = Duration::from_secs(15);
const RELAY_BUFFER: usize = 64 * 1024;

/// Serve callers on a TCP listener until it fails. Bind it to loopback only.
pub async fn serve_tcp(listener: TcpListener, policy: Arc<dyn Policy>) {
    loop {
        let Ok((stream, _)) = listener.accept().await else {
            return;
        };
        let _ = stream.set_nodelay(true);
        tokio::spawn(handle(stream, Arc::clone(&policy)));
    }
}

async fn handle<S>(mut stream: S, policy: Arc<dyn Policy>)
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let Ok(Ok(Some(request))) =
        tokio::time::timeout(HANDSHAKE_BUDGET, negotiate(&mut stream, policy.as_ref())).await
    else {
        return;
    };
    let started = Instant::now();
    let decided = {
        let policy = Arc::clone(&policy);
        let request = request.clone();
        tokio::task::spawn_blocking(move || policy.decide(&request)).await
    };
    let Ruling { verdict, rule } =
        decided.unwrap_or_else(|_| Verdict::Block("the policy failed".into()).into());
    let mut flow = Flow {
        caller: request.caller.clone(),
        purpose: request.purpose.clone(),
        host: request.host.to_string(),
        port: request.port,
        route: Route::Blocked,
        bytes_up: 0,
        bytes_down: 0,
        duration: Duration::ZERO,
        error: None,
        rule,
    };
    let dialled = match verdict {
        Verdict::Block(reason) => Err((Reply::NotAllowed, reason)),
        Verdict::Direct(reach) => {
            flow.route = Route::Direct;
            dial_direct(&request.host, request.port, &reach).await
        }
        Verdict::Upstream(proxy) => {
            flow.route = Route::Upstream;
            tokio::time::timeout(
                CONNECT_BUDGET,
                upstream::connect(&proxy, &request.host, request.port),
            )
            .await
            .map_err(|_| anyhow!("the upstream proxy did not answer in time"))
            .and_then(|connected| connected)
            .map_err(|e| (Reply::HostUnreachable, format!("{e:#}")))
        }
    };
    let mut target = match dialled {
        Ok(target) => target,
        Err((code, reason)) => {
            if code == Reply::NotAllowed {
                flow.route = Route::Blocked;
            }
            let _ = reply(&mut stream, code).await;
            flow.error = Some(reason);
            flow.duration = started.elapsed();
            policy.record(flow);
            return;
        }
    };
    if reply(&mut stream, Reply::Succeeded).await.is_ok() {
        match tokio::io::copy_bidirectional_with_sizes(
            &mut stream,
            &mut target,
            RELAY_BUFFER,
            RELAY_BUFFER,
        )
        .await
        {
            Ok((up, down)) => {
                flow.bytes_up = up;
                flow.bytes_down = down;
            }
            Err(e) => flow.error = Some(e.to_string()),
        }
    }
    flow.duration = started.elapsed();
    policy.record(flow);
}

async fn negotiate<S>(stream: &mut S, policy: &dyn Policy) -> Result<Option<Request>>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let credentials = accept_credentials(stream).await?;
    let Some(caller) = policy.caller_of(&credentials.password) else {
        answer_credentials(stream, false).await?;
        return Ok(None);
    };
    answer_credentials(stream, true).await?;
    match read_connect(stream).await? {
        Ok((host, port)) => Ok(Some(Request {
            caller,
            purpose: credentials.username,
            host,
            port,
        })),
        Err(refusal) => {
            reply(stream, refusal).await?;
            Ok(None)
        }
    }
}

// Every resolved address is checked, not only the one dialled: a resolver
// answering one public and one private address is a rebinding attempt.
#[expect(
    clippy::disallowed_methods,
    reason = "the egress gateway dials once the policy routed this connection direct and every resolved address passed the guards"
)]
async fn dial_direct(
    host: &Host,
    port: u16,
    reach: &Reach,
) -> std::result::Result<TcpStream, (Reply, String)> {
    let addrs: Vec<SocketAddr> = match host {
        Host::Ip(ip) => vec![SocketAddr::new(*ip, port)],
        Host::Name(name) => tokio::net::lookup_host((name.as_str(), port))
            .await
            .map_err(|e| (Reply::HostUnreachable, format!("resolve {name}: {e}")))?
            .collect(),
    };
    Landing {
        host,
        port,
        reach,
        networks: lan::interface_networks(),
    }
    .check(&addrs)?;
    let mut last = None;
    for addr in addrs {
        match tokio::time::timeout(CONNECT_BUDGET, TcpStream::connect(addr)).await {
            Ok(Ok(stream)) => {
                let _ = stream.set_nodelay(true);
                return Ok(stream);
            }
            Ok(Err(e)) => last = Some(format!("connect {addr}: {e}")),
            Err(_) => last = Some(format!("connect {addr}: timed out")),
        }
    }
    Err((
        Reply::ConnectionRefused,
        last.unwrap_or_else(|| format!("could not reach {host}")),
    ))
}

struct Landing<'a> {
    host: &'a Host,
    port: u16,
    reach: &'a Reach,
    networks: Vec<LocalNetwork>,
}

impl Landing<'_> {
    fn check(&self, addrs: &[SocketAddr]) -> std::result::Result<(), (Reply, String)> {
        let host = self.host;
        if addrs.is_empty() {
            return Err((
                Reply::HostUnreachable,
                format!("{host} resolved to no address"),
            ));
        }
        match addrs.iter().find(|a| !self.admits(a.ip())) {
            Some(refused) => Err((
                Reply::NotAllowed,
                format!(
                    "{host} resolves to {}, which this caller may not reach",
                    refused.ip()
                ),
            )),
            None => Ok(()),
        }
    }

    fn admits(&self, ip: IpAddr) -> bool {
        let ip = ip.to_canonical();
        let own_listener = self.reach.own_ports.contains(&self.port)
            && lan::reaches_this_machine(ip, &self.networks);
        !lan::is_link_local(ip)
            && !lan::is_cloud_metadata(ip)
            && !own_listener
            && !self.rebinds(ip)
            && (self.reach.private_allowed || is_public(ip))
    }

    fn rebinds(&self, ip: IpAddr) -> bool {
        matches!(self.host, Host::Name(name) if !is_localhost(name)) && lan::is_this_host(ip)
    }
}

fn is_localhost(name: &str) -> bool {
    let name = name.trim_end_matches('.').to_ascii_lowercase();
    name == "localhost" || name.ends_with(".localhost")
}

#[cfg(test)]
mod tests;
