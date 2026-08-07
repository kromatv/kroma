//! Install execution: download + checksum-verify + install a resolved plan in
//! dependency order (see [`super::plan`] for the resolution itself), plus the
//! batch update path. All-or-nothing per module: a failed dep aborts before
//! its dependents are touched. Every operation streams `module.op.*` progress
//! frames (see [`super::events`]).

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, bail, Result};
use kroma_module_supervisor::Supervisor;
use serde::Serialize;
use serde_json::{json, Value};

use super::catalog::{self, CatalogModule};
use super::events::Op;
use super::plan::{plan_brief, root_list, Planned, Planner, SERVER_VERSION};
use super::registries;
use crate::state::SharedState;

/// Resolve, download and install `root_id` (plus opted-in optional extras and
/// any missing hard dependencies), dependencies first. Returns the report the
/// Store UI shows: everything actually installed, deps included.
pub async fn install_with_deps(
    state: &SharedState,
    sup: &Arc<Supervisor>,
    root_id: &str,
    include: &[String],
) -> Result<Value> {
    let modules = registries::fetch_merged(state, sup).await?;
    let mut planner = Planner::new(state, &modules);
    planner.roots(&root_list(root_id, include))?;
    let op = Op::begin(state, "install", root_id, plan_brief(&planner.plan));
    match run_plan(sup, &op, &planner.plan).await {
        Ok(installed) => {
            op.finish(None);
            Ok(json!({ "op": op.id(), "requested": root_id, "installed": installed }))
        }
        Err(e) => {
            op.finish(Some(&format!("{e:#}")));
            Err(e)
        }
    }
}

/// Download + verify + install every planned module in dependency order,
/// streaming progress on `op`. Blocking work (unpack + spawn) runs off the
/// async runtime.
async fn run_plan(sup: &Arc<Supervisor>, op: &Op, plan: &[Planned<'_>]) -> Result<Vec<Value>> {
    let mut installed = Vec::new();
    for p in plan {
        let entry = p.entry;
        let artifact = catalog::pick_artifact(entry)
            .ok_or_else(|| anyhow!("'{}' has no build for this server's platform", entry.id))?;
        // Registry installs download and run native code, so harden the transport:
        // require HTTPS (no cleartext artifact fetch) and a published sha256 (the
        // catalog generator always emits one). The bytes are verified against it
        // before anything is written or spawned.
        if !artifact.url.starts_with("https://") {
            bail!("'{}' artifact URL must be https (got '{}')", entry.id, artifact.url);
        }
        let sha = artifact
            .sha256
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                anyhow!("'{}' has no published sha256 checksum; refusing to install", entry.id)
            })?;
        let bytes = {
            // Throttled: one frame per ~1% (floor 64 KiB), plus the final byte count.
            let last = AtomicU64::new(0);
            let on_progress = |received: u64, total: Option<u64>| {
                let step = total.map_or(512 * 1024, |t| (t / 100).max(64 * 1024));
                let done = total == Some(received);
                if !done && received < last.load(Ordering::Relaxed) + step {
                    return;
                }
                last.store(received, Ordering::Relaxed);
                op.download(&entry.id, received, total);
            };
            sup.download_artifact(&artifact.url, Some(sha), &on_progress)
                .await
                .map_err(|e| anyhow!("downloading '{}' failed: {e:#}", entry.id))?
        };
        op.installing(&entry.id);
        let manifest = {
            let sup = sup.clone();
            let expected = entry.id.clone();
            tokio::task::spawn_blocking(move || sup.install(&bytes, Some(&expected)))
                .await
                .map_err(|_| anyhow!("install task panicked"))?
                .map_err(|e| anyhow!("installing '{}' failed: {e:#}", entry.id))?
        };
        op.done(&entry.id, &entry.version);
        installed.push(json!({
            "id": manifest.get("id"),
            "name": manifest.get("name"),
            "version": manifest.get("version"),
        }));
    }
    Ok(installed)
}

#[derive(Serialize)]
pub struct UpdatedModule {
    pub id: String,
    pub from: String,
    pub to: String,
}

#[derive(Serialize)]
pub struct FailedUpdate {
    pub id: String,
    pub error: String,
}

/// `POST /store/update`'s wire shape, straight off the type.
#[derive(Serialize)]
pub struct UpdateOutcome {
    pub updated: Vec<UpdatedModule>,
    pub failed: Vec<FailedUpdate>,
}

/// Update every runtime-installed module (or the `only` subset) to the newest
/// compatible catalog version, off ONE catalog fetch. One `module.op.*` stream
/// covers the whole batch. `Err` only when the catalog itself is unreachable.
pub async fn update_all(
    state: &SharedState,
    sup: &Arc<Supervisor>,
    only: Option<&[String]>,
) -> Result<UpdateOutcome> {
    let modules = registries::fetch_merged(state, sup).await?;
    let by_id: std::collections::HashMap<&str, &CatalogModule> =
        modules.iter().map(|m| (m.id.as_str(), m)).collect();
    let mut outcome = UpdateOutcome { updated: Vec::new(), failed: Vec::new() };
    let mut targets: Vec<(&CatalogModule, String)> = Vec::new();
    for manifest in sup.installed_manifests() {
        let (Some(id), Some(cur)) = (
            manifest.get("id").and_then(Value::as_str),
            manifest.get("version").and_then(Value::as_str),
        ) else {
            continue;
        };
        if only.is_some_and(|ids| !ids.iter().any(|x| x == id)) {
            continue;
        }
        let Some(entry) = by_id.get(id) else { continue };
        if !kroma_module_manifest::is_newer(&entry.version, cur) {
            continue;
        }
        if !kroma_module_manifest::server_satisfies(entry.min_server.as_deref(), SERVER_VERSION) {
            outcome.failed.push(FailedUpdate {
                id: id.to_string(),
                error: format!(
                    "requires KROMA server {} (this server is {SERVER_VERSION}); update the server first",
                    entry.min_server.as_deref().unwrap_or("?"),
                ),
            });
            continue;
        }
        targets.push((entry, cur.to_string()));
    }
    if targets.is_empty() {
        return Ok(outcome);
    }
    let brief = Value::Array(targets.iter().map(|(e, _)| super::plan::entry_brief(e)).collect());
    let op = Op::begin(state, "update", "", brief);
    for (entry, from) in targets {
        // Re-plan per module: an earlier update may have pulled a dependency
        // this one no longer needs to.
        let mut planner = Planner::new(state, &modules);
        let result = match planner.roots(&[entry.id.as_str()]) {
            Ok(()) => run_plan(sup, &op, &planner.plan).await.map(|_| ()),
            Err(e) => Err(e),
        };
        match result {
            Ok(()) => outcome.updated.push(UpdatedModule {
                id: entry.id.clone(),
                from,
                to: entry.version.clone(),
            }),
            Err(e) => {
                outcome.failed.push(FailedUpdate { id: entry.id.clone(), error: format!("{e:#}") })
            }
        }
    }
    let error =
        (!outcome.failed.is_empty()).then(|| format!("{} update(s) failed", outcome.failed.len()));
    op.finish(error.as_deref());
    Ok(outcome)
}

/// Boot-time auto-update (opt-out via the `moduleAutoUpdate` setting), so a
/// server update alone keeps the modules current instead of leaving the admin
/// to update each one by hand. Best-effort: failures are logged and skipped.
pub async fn auto_update(state: &SharedState, sup: &Arc<Supervisor>) -> Vec<UpdatedModule> {
    match update_all(state, sup, None).await {
        Ok(outcome) => {
            for f in &outcome.failed {
                tracing::warn!(module = %f.id, error = %f.error, "module auto-update failed");
            }
            for u in &outcome.updated {
                tracing::info!(module = %u.id, from = %u.from, to = %u.to, "auto-updated module");
            }
            outcome.updated
        }
        Err(e) => {
            tracing::warn!(error = %format!("{e:#}"), "module auto-update: catalog fetch failed");
            Vec::new()
        }
    }
}
