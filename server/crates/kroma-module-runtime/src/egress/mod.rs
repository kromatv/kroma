//! The gate and sink a sidecar puts on `kroma_http` at boot, so every `Fetch`
//! this module makes is ruled by the core's network policy and lands in its
//! journal.

use std::sync::Arc;

use kroma_module_wire::{NetworkAnswer, NetworkAsk, NetworkFlow};

use crate::remote_host::RemoteHost;

mod gate;
mod reporter;

use gate::{Asked, Gate};
use reporter::Reporter;

const ASK_MAX_TIME_SECS: u32 = 5;
const REPORT_MAX_TIME_SECS: u32 = 10;
// What a core that predates the policy answers: no such route (404), or the
// web shell refusing a POST (405).
const NO_SUCH_ROUTE: [u16; 2] = [404, 405];

pub(crate) fn install(host: &RemoteHost) {
    let asking = host.clone();
    let gate = Gate::new(move |ask: &NetworkAsk| ask_core(&asking, ask));
    if let Err(error) = kroma_http::egress::set_gate(Arc::new(move |outgoing| gate.rule(outgoing)))
    {
        tracing::warn!(%error, "the network gate was not installed");
    }
    let reporting = host.clone();
    let reporter = Reporter::start(move |flows| report_to_core(&reporting, &flows));
    if let Err(error) =
        kroma_http::egress::set_sink(Arc::new(move |exchange, _| reporter.push(exchange)))
    {
        tracing::warn!(%error, "the network sink was not installed");
    }
}

fn ask_core(host: &RemoteHost, ask: &NetworkAsk) -> Asked {
    let Ok(body) = serde_json::to_value(ask) else {
        return Asked::Unreachable;
    };
    let reply = host
        .callback()
        .max_time(ASK_MAX_TIME_SECS)
        .post_json(&host.host_url("network/decide"), &body);
    match reply {
        Ok(response) if NO_SUCH_ROUTE.contains(&response.status) => Asked::NoPolicy,
        Ok(response) => match response
            .ensure_ok()
            .and_then(|ok| ok.json::<NetworkAnswer>())
        {
            Ok(answer) => Asked::Answer(answer),
            Err(error) => {
                tracing::warn!(%error, "the core refused a network ruling");
                Asked::Unreachable
            }
        },
        Err(error) => {
            tracing::warn!(%error, "the core's network policy is unreachable");
            Asked::Unreachable
        }
    }
}

fn report_to_core(host: &RemoteHost, flows: &[NetworkFlow]) {
    let Ok(body) = serde_json::to_value(flows) else {
        return;
    };
    let sent = host
        .callback()
        .max_time(REPORT_MAX_TIME_SECS)
        .post_json(&host.host_url("network/flows"), &body);
    if let Err(error) = sent {
        tracing::debug!(%error, "the core's network journal is unreachable");
    }
}
