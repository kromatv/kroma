//! WireGuard configs kept on this server so the admin switches between them in
//! one click: one file per Proton country, or any provider's. Kept beside the
//! bridge's files, readable by the server's user alone; a config's text never
//! leaves the server.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::provider::{provider_of_config, ProviderView};

pub mod routes;

const FILE: &str = "saved.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Saved {
    pub id: String,
    pub config: String,
}

/// A kept config as the page lists it: what it is, never what it holds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedView {
    pub id: String,
    pub label: String,
    pub provider: Option<ProviderView>,
    pub active: bool,
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
    crate::vpn::write_private(&path(dir), &text)
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

/// Forget one kept config. Answers whether it was there.
pub(crate) fn remove(dir: &Path, id: &str) -> std::io::Result<bool> {
    let mut saved = load(dir);
    let before = saved.len();
    saved.retain(|one| one.id != id);
    store(dir, &saved)?;
    Ok(saved.len() != before)
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
                id: one.id,
                provider,
            }
        })
        .collect()
}

fn label_of(config: &str, provider: Option<&ProviderView>) -> String {
    if let Some(ProviderView::Proton {
        server: Some(server),
        ..
    }) = provider
    {
        return format!("Proton VPN · {server}");
    }
    config
        .lines()
        .filter_map(|line| line.trim().strip_prefix("Endpoint"))
        .filter_map(|rest| rest.trim_start().strip_prefix('='))
        .map(|endpoint| endpoint.trim().to_string())
        .next()
        .unwrap_or_default()
}

#[cfg(test)]
mod tests;
