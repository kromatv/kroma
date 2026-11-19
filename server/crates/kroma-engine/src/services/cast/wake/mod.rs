//! Bringing back a television that is off or out of the app. The server only
//! keeps what a television said about reaching itself and derives the steps
//! from it. It never reaches a television: the server may be anywhere, so the
//! sender, which is on the television's network, runs the steps.

use std::net::Ipv4Addr;

use crate::db::CastDevice;
use crate::model::{wake_plan, CastReceiver, CastWakeHint, CastWakeStep, CastWakeTarget};

mod keep;

#[cfg(test)]
mod tests;

pub use keep::keep;

const BESIDE_SERVER: &str = "LAN";

/// A television as it arrived: its roster row, the account it is signed into,
/// what it said about reaching itself, and the address its request came from.
pub struct Arrival {
    pub row: CastReceiver,
    pub user_id: String,
    pub hint: CastWakeHint,
    pub peer: String,
}

impl Arrival {
    fn beside_server(&self) -> bool {
        self.row.network == BESIDE_SERVER
    }

    // The address the request came from is the television's own address on its
    // network only when it reached the server without leaving that network.
    fn seen_address(&self) -> Option<Ipv4Addr> {
        self.peer
            .parse::<Ipv4Addr>()
            .ok()
            .filter(|ip| self.beside_server() && ip.is_private())
    }
}

/// The row to keep for a television that just arrived, or `None` when nothing
/// was said or seen that it could be brought back by. An address the server
/// saw for itself beats the one the television gave.
pub fn remembered(arrival: &Arrival, now_ms: i64) -> Option<CastDevice> {
    let said = arrival.hint.checked();
    let target = CastWakeTarget {
        mac: said.mac,
        address: arrival.seen_address().or(said.address),
        app_id: said.app_id,
    };
    if wake_plan(&arrival.row.platform, &target).is_empty() {
        return None;
    }
    Some(CastDevice {
        receiver_id: arrival.row.id.clone(),
        user_id: arrival.user_id.clone(),
        name: arrival.row.name.clone(),
        platform: arrival.row.platform.clone(),
        mac: target.mac,
        address: target.address.map(|a| a.to_string()),
        app_id: target.app_id,
        beside_server: arrival.beside_server(),
        seen_at: now_ms,
    })
}

/// The steps that bring a kept television back. What was stored is checked
/// again on the way out: a row is only as sound as the build that wrote it.
pub fn plan(device: &CastDevice) -> Vec<CastWakeStep> {
    let target = CastWakeHint {
        mac: device.mac.clone(),
        address: device.address.clone(),
        app_id: device.app_id.clone(),
    }
    .checked();
    wake_plan(&device.platform, &target)
}

/// A kept television as a roster row, for the account `username` that keeps it.
pub fn asleep_row(device: &CastDevice, username: &str) -> CastReceiver {
    let network = if device.beside_server {
        BESIDE_SERVER
    } else {
        "WAN"
    };
    CastReceiver {
        id: device.receiver_id.clone(),
        name: device.name.clone(),
        platform: device.platform.clone(),
        username: username.to_string(),
        network: network.to_string(),
        now_playing: None,
        controllers: Vec::new(),
        asleep: true,
    }
}
