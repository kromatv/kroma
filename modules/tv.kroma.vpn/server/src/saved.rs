//! WireGuard configs kept on this server so the admin switches between them in
//! one click: one file per Proton country, or any provider's. Kept beside the
//! bridge's files, readable by the server's user alone; a config's text never
//! leaves the server.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::provider::{label_of, provider_of_config, ProviderView};

pub mod routes;

const FILE: &str = "saved.json";

/// How many kept configs may run a tunnel of their own beside the default one.
pub(crate) const ROUTER_SLOTS: u8 = 4;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Saved {
    pub id: String,
    pub config: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slot: Option<u8>,
}

/// Why a config could not go in the router.
#[derive(Debug)]
pub(crate) enum RoutingError {
    Missing,
    Full,
    Io(std::io::Error),
}

/// A kept config as the page lists it: what it is, never what it holds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedView {
    pub id: String,
    pub label: String,
    pub provider: Option<ProviderView>,
    pub active: bool,
    pub routable: bool,
}

fn path(dir: &Path) -> PathBuf {
    dir.join(FILE)
}

/// Whether `config` has what a tunnel needs: both sections, both keys, and
/// the peer's endpoint.
pub(crate) fn is_wireguard(config: &str) -> bool {
    let lines: Vec<&str> = config.lines().map(str::trim).collect();
    let has = |prefix: &str| lines.iter().any(|line| line.starts_with(prefix));
    has("[Interface]") && has("[Peer]") && has("PrivateKey") && has("PublicKey") && has("Endpoint")
}

pub(crate) fn load(dir: &Path) -> Vec<Saved> {
    std::fs::read(path(dir))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn store(dir: &Path, saved: &[Saved]) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let text = serde_json::to_string(saved).map_err(std::io::Error::other)?;
    crate::bridge::write_private(&path(dir), &text)
}

/// Keep every config in `configs`, the same file once however often it is
/// dropped, and answer the ids in the order they came.
pub(crate) fn add(dir: &Path, configs: &[String]) -> std::io::Result<Vec<String>> {
    let mut saved = load(dir);
    let mut ids = Vec::with_capacity(configs.len());
    for config in configs {
        let config = config.trim().to_string();
        let id = kroma_module_sdk::primitives::short_hash(&config);
        if !saved.iter().any(|one| one.id == id) {
            saved.push(Saved {
                id: id.clone(),
                config,
                slot: None,
            });
        }
        ids.push(id);
    }
    store(dir, &saved)?;
    Ok(ids)
}

pub(crate) fn find(dir: &Path, id: &str) -> Option<Saved> {
    load(dir).into_iter().find(|one| one.id == id)
}

/// Forget every kept config built on `private_key`, once that key is revoked.
pub(crate) fn forget_key(dir: &Path, private_key: &str) -> std::io::Result<()> {
    let mut saved = load(dir);
    saved.retain(|one| crate::wireguard::value_of(&one.config, "PrivateKey") != Some(private_key));
    store(dir, &saved)
}

/// Forget one kept config. Answers whether it was there.
pub(crate) fn remove(dir: &Path, id: &str) -> std::io::Result<bool> {
    let mut saved = load(dir);
    let before = saved.len();
    saved.retain(|one| one.id != id);
    store(dir, &saved)?;
    Ok(saved.len() != before)
}

/// Offer `id` to the router as a network of its own, on the lowest free slot,
/// or take it back out. A config already in keeps its slot, so its port holds.
pub(crate) fn set_routable(dir: &Path, id: &str, on: bool) -> Result<(), RoutingError> {
    let mut saved = load(dir);
    let taken: Vec<u8> = saved.iter().filter_map(|one| one.slot).collect();
    let one = saved
        .iter_mut()
        .find(|one| one.id == id)
        .ok_or(RoutingError::Missing)?;
    one.slot = match (on, one.slot) {
        (false, _) => None,
        (true, Some(slot)) => Some(slot),
        (true, None) => Some(
            (1..=ROUTER_SLOTS)
                .find(|slot| !taken.contains(slot))
                .ok_or(RoutingError::Full)?,
        ),
    };
    store(dir, &saved).map_err(RoutingError::Io)
}

/// The kept configs the router may send calls through, by slot.
pub(crate) fn routed(dir: &Path) -> Vec<Saved> {
    let mut routed: Vec<Saved> = load(dir)
        .into_iter()
        .filter(|one| one.slot.is_some())
        .collect();
    routed.sort_by_key(|one| one.slot);
    routed
}

/// The port a slot's tunnel listens on: the slot's place above the default
/// tunnel's, which the manifest declares as one run of ports.
pub(crate) fn port_for(base: u16, slot: u8) -> Option<u16> {
    base.checked_add(u16::from(slot))
}

/// Every kept config, marked active when it is the tunnel's config now.
pub(crate) fn views(dir: &Path, active_config: &str) -> Vec<SavedView> {
    load(dir)
        .into_iter()
        .map(|one| {
            let provider = provider_of_config(&one.config);
            SavedView {
                label: label_of(&one.config, provider.as_ref()),
                active: one.config.trim() == active_config.trim(),
                routable: one.slot.is_some(),
                id: one.id,
                provider,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests;
