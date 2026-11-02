//! The two ports the helper listens on when the operator named neither, chosen
//! once and kept, so a restart does not move a port someone forwarded.

use std::ops::Range;
use std::path::Path;

use kroma_module_sdk::primitives::random_u32;
use serde::{Deserialize, Serialize};

const FILE: &str = "engine-ports.json";
const CHOOSE_FROM: Range<u32> = 26_000..32_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Ports {
    pub api: u16,
    pub peers: u16,
}

fn a_port() -> u16 {
    let span = CHOOSE_FROM.end - CHOOSE_FROM.start;
    u16::try_from(CHOOSE_FROM.start + random_u32() % span).unwrap_or(26_000)
}

fn fresh() -> Ports {
    let api = a_port();
    let mut peers = a_port();
    while peers == api {
        peers = a_port();
    }
    Ports { api, peers }
}

fn keep(state_dir: &Path, ports: Ports) -> Ports {
    let written = serde_json::to_vec(&ports)
        .map_err(std::io::Error::other)
        .and_then(|bytes| {
            std::fs::create_dir_all(state_dir)?;
            std::fs::write(state_dir.join(FILE), bytes)
        });
    if let Err(error) = written {
        tracing::warn!(%error, "could not keep the engine's ports; a restart will choose again");
    }
    ports
}

/// The ports kept from an earlier run, or new ones.
pub(crate) fn chosen(state_dir: &Path) -> Ports {
    std::fs::read(state_dir.join(FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_else(|| keep(state_dir, fresh()))
}

/// Choose again, because a start failed and one of these may be taken.
pub(crate) fn rotate(state_dir: &Path) -> Ports {
    keep(state_dir, fresh())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_ports_chosen_once_are_the_ports_a_restart_finds() {
        let dir = kroma_module_sdk::testing::temp_dir("engine-ports");

        let first = chosen(dir.path());
        let second = chosen(dir.path());

        assert_eq!(first, second);
        assert_ne!(first.api, first.peers);
    }

    #[test]
    fn every_port_chosen_is_in_the_quiet_range() {
        for _ in 0..200 {
            let ports = fresh();

            assert!(CHOOSE_FROM.contains(&u32::from(ports.api)));
            assert!(CHOOSE_FROM.contains(&u32::from(ports.peers)));
        }
    }

    #[test]
    fn a_rotation_is_what_the_next_read_finds() {
        let dir = kroma_module_sdk::testing::temp_dir("engine-ports-rotate");
        chosen(dir.path());

        let rotated = rotate(dir.path());

        assert_eq!(chosen(dir.path()), rotated);
    }

    #[test]
    fn a_file_nobody_can_read_is_replaced_rather_than_trusted() {
        let dir = kroma_module_sdk::testing::temp_dir("engine-ports-bad");
        std::fs::write(dir.path().join(FILE), b"{not json").unwrap();

        let ports = chosen(dir.path());

        assert_eq!(chosen(dir.path()), ports);
    }
}
