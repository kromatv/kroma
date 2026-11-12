//! Who reaches this server: a daily tally of the requests clients make, by the
//! address they came from, the road they took and the User-Agent they sent.

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};

use crate::db::network_flows::{day_of, RETENTION_DAYS};
use crate::db::network_inbound::{self, InboundTally, InboundTotals};
use crate::db::Pool;
use crate::services::playback::{cidr_contains, is_lan};

use super::journal::{clipped, merge, saturating_i64, Tally, MAX_PENDING_TALLIES};

const MAX_ADDRESS_CHARS: usize = 64;
const MAX_USER_AGENT_CHARS: usize = 200;
const MAX_ROWS: usize = 500;
const DAY_MS: i64 = 86_400_000;
const OVERLAY_NETWORK: &str = "100.64.0.0/10";

/// The road a client took to reach this server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Via {
    Lan,
    Vpn,
    Tunnel,
    Internet,
}

impl Via {
    fn as_str(self) -> &'static str {
        match self {
            Via::Lan => "lan",
            Via::Vpn => "vpn",
            Via::Tunnel => "tunnel",
            Via::Internet => "internet",
        }
    }
}

/// How `address` reached this server. `tunnelled` wins: a phone on the same
/// Wi-Fi that dials the public name still crossed the tunnel. An overlay address
/// (Tailscale, CGNAT space) reads as a VPN, and any other VPN handing out private
/// addresses is indistinguishable from the LAN.
pub fn via_of(address: &str, tunnelled: bool, local_nets: &[String]) -> Via {
    if tunnelled {
        return Via::Tunnel;
    }
    let overlay = address
        .parse::<IpAddr>()
        .is_ok_and(|ip| cidr_contains(OVERLAY_NETWORK, &ip));
    if overlay {
        Via::Vpn
    } else if is_lan(address, local_nets) {
        Via::Lan
    } else {
        Via::Internet
    }
}

/// One finished request a client made of this server.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Arrival {
    pub address: String,
    pub via: Via,
    pub user_agent: String,
    pub bytes_in: u64,
    pub bytes_out: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct TallyKey {
    day: i64,
    address: String,
    via: Via,
    user_agent: String,
}

#[derive(Default)]
pub struct InboundJournal {
    pending: Mutex<HashMap<TallyKey, Tally>>,
}

impl InboundJournal {
    pub fn record(&self, arrival: Arrival, at_ms: i64) {
        let key = TallyKey {
            day: day_of(at_ms),
            address: clipped(&arrival.address, MAX_ADDRESS_CHARS),
            via: arrival.via,
            user_agent: clipped(&arrival.user_agent, MAX_USER_AGENT_CHARS),
        };
        let delta = Tally {
            count: 1,
            bytes_in: saturating_i64(arrival.bytes_in),
            bytes_out: saturating_i64(arrival.bytes_out),
            last_at: at_ms,
        };
        let mut pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
        if pending.len() >= MAX_PENDING_TALLIES && !pending.contains_key(&key) {
            return;
        }
        merge(pending.entry(key).or_default(), delta);
    }

    /// Write the tallies gathered since the last flush. A failed write keeps
    /// them for the next one.
    pub fn flush(&self, pool: &Pool) -> anyhow::Result<()> {
        let taken = std::mem::take(&mut *self.pending.lock().unwrap_or_else(PoisonError::into_inner));
        let deltas: Vec<InboundTally> = taken
            .iter()
            .map(|(key, tally)| InboundTally {
                day: key.day,
                address: key.address.clone(),
                via: key.via.as_str().to_string(),
                user_agent: key.user_agent.clone(),
                count: tally.count,
                bytes_in: tally.bytes_in,
                bytes_out: tally.bytes_out,
                last_at: tally.last_at,
            })
            .collect();
        let written = network_inbound::add(pool, &deltas);
        if written.is_err() {
            let mut pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            for (key, tally) in taken {
                merge(pending.entry(key).or_default(), tally);
            }
        }
        written
    }
}

/// `since` is epoch milliseconds: the start of the first UTC day counted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboundSummary {
    pub since: i64,
    pub totals: InboundSummaryTotals,
    pub rows: Vec<InboundRow>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboundSummaryTotals {
    pub requests: i64,
    pub addresses: i64,
    pub bytes_in: i64,
    pub bytes_out: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboundRow {
    pub address: String,
    pub via: String,
    pub user_agent: String,
    pub count: i64,
    pub bytes_in: i64,
    pub bytes_out: i64,
    pub last_at: i64,
}

pub(super) fn summarize(pool: &Pool, days: u32, now_ms: i64) -> anyhow::Result<InboundSummary> {
    let days = i64::from(days).clamp(1, RETENTION_DAYS);
    let since_day = day_of(now_ms) - (days - 1);
    let InboundTotals {
        requests,
        addresses,
        bytes_in,
        bytes_out,
    } = network_inbound::totals_since(pool, since_day)?;
    let rows = network_inbound::since(pool, since_day, MAX_ROWS)?
        .into_iter()
        .map(|tally| InboundRow {
            address: tally.address,
            via: tally.via,
            user_agent: tally.user_agent,
            count: tally.count,
            bytes_in: tally.bytes_in,
            bytes_out: tally.bytes_out,
            last_at: tally.last_at,
        })
        .collect();
    Ok(InboundSummary {
        since: since_day * DAY_MS,
        totals: InboundSummaryTotals {
            requests,
            addresses,
            bytes_in,
            bytes_out,
        },
        rows,
    })
}

#[cfg(test)]
mod tests;
