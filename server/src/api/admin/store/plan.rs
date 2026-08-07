//! The install planner: resolve a root's hard `dependsOn` closure against what
//! is already present (compiled-in + runtime installed) and the registry
//! catalog, dependencies first, and derive the opt-in rows the install dialog
//! offers (declared optional deps, plus providers for capability requirements
//! nothing satisfies). Pure plan math: nothing here downloads.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use anyhow::{anyhow, bail, Result};
use kroma_module_supervisor::Supervisor;
use serde_json::{json, Map, Value};

use super::catalog::{self, CatalogModule};
use super::registries;
use crate::state::SharedState;

// This server's version, checked against each entry's `minServer`.
pub(super) const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

pub(super) struct Planned<'a> {
    pub entry: &'a CatalogModule,
    installed: Option<String>,
    requested: bool,
}

/// Post-order walk of the hard-dependency graph, so dependencies land in the
/// plan before their dependents. A dependency already present at a satisfying
/// version is skipped; one that is missing (or installed outside the declared
/// range) is planned from the catalog. A root bypasses that shortcut so an
/// explicit install/update of an already-installed module still proceeds.
pub(super) struct Planner<'a> {
    by_id: HashMap<&'a str, &'a CatalogModule>,
    present: HashMap<String, String>,
    // `(kind, id)` capabilities the present modules provide, for `requires`
    // satisfaction. Disabled modules count: the admin can enable them.
    present_provides: Vec<(String, String)>,
    pub plan: Vec<Planned<'a>>,
    planned: HashSet<String>,
    stack: Vec<String>,
}

impl<'a> Planner<'a> {
    pub(super) fn new(state: &SharedState, modules: &'a [CatalogModule]) -> Self {
        // Everything already on this server (compiled-in roster + installed
        // .kmod), with its version: a satisfied dependency is not reinstalled.
        let manifests = kroma_module_kernel::manifests(state);
        let present_provides = manifests
            .iter()
            .flat_map(|m| m.provides.iter().map(|c| (c.kind.clone(), c.id.clone())))
            .collect();
        let present = manifests.into_iter().map(|m| (m.id, m.version)).collect();
        Self::with_present(modules, present, present_provides)
    }

    fn with_present(
        modules: &'a [CatalogModule],
        present: HashMap<String, String>,
        present_provides: Vec<(String, String)>,
    ) -> Self {
        Self {
            by_id: modules.iter().map(|m| (m.id.as_str(), m)).collect(),
            present,
            present_provides,
            plan: Vec::new(),
            planned: HashSet::new(),
            stack: Vec::new(),
        }
    }

    pub(super) fn roots(&mut self, roots: &[&str]) -> Result<()> {
        for root in roots {
            self.visit(root, true)?;
        }
        Ok(())
    }

    fn visit(&mut self, id: &str, is_root: bool) -> Result<()> {
        if self.planned.contains(id) {
            return Ok(());
        }
        if self.stack.iter().any(|s| s == id) {
            bail!("dependency cycle in the registry involving '{id}'");
        }
        let entry = *self.by_id.get(id).ok_or_else(|| {
            if is_root {
                anyhow!("'{id}' is not in the registry")
            } else {
                anyhow!("dependency '{id}' is neither installed nor in the registry")
            }
        })?;
        // Fail fast with the precise blocker instead of a partial install.
        if !kroma_module_manifest::server_satisfies(entry.min_server.as_deref(), SERVER_VERSION) {
            bail!(
                "'{id}' requires KROMA server {} (this server is {SERVER_VERSION}); update the server first",
                entry.min_server.as_deref().unwrap_or("?"),
            );
        }
        if catalog::pick_artifact(entry).is_none() {
            bail!("'{id}' has no build for this server's platform");
        }
        self.stack.push(id.to_string());
        for (dep_id, range) in &entry.depends_on {
            let satisfied = self.present.get(dep_id).is_some_and(|installed| {
                range.as_deref().is_none_or(|r| kroma_module_manifest::range_matches(r, installed))
            });
            if satisfied {
                continue;
            }
            // The catalog's copy must itself satisfy the declared range, or the
            // auto-install would produce a combination the dependent rejects.
            if let (Some(range), Some(dep_entry)) = (range.as_deref(), self.by_id.get(dep_id.as_str())) {
                if !kroma_module_manifest::range_matches(range, &dep_entry.version) {
                    bail!(
                        "'{id}' needs {dep_id}@{range} but the registry has {}",
                        dep_entry.version,
                    );
                }
            }
            self.visit(dep_id, false)?;
        }
        self.stack.pop();
        self.planned.insert(id.to_string());
        self.plan.push(Planned {
            entry,
            installed: self.present.get(id).cloned(),
            requested: is_root,
        });
        Ok(())
    }

    fn offerable(&self, id: &str) -> Option<&'a CatalogModule> {
        if self.planned.contains(id) || self.present.contains_key(id) {
            return None;
        }
        let entry = *self.by_id.get(id)?;
        catalog::compat_verdict(entry).0.then_some(entry)
    }

    /// The install dialog's opt-in rows: declared `optionalDependsOn` targets,
    /// plus, for every capability a planned module `requires` that nothing
    /// installed or planned provides, the catalog's compatible providers.
    /// The second list is the requirements no available module can satisfy.
    fn optional(&self) -> (Vec<Value>, Vec<Value>) {
        let mut seen = HashSet::new();
        let mut rows = self.declared_optional_rows(&mut seen);
        let provided = self.provided_after_plan();
        let mut missing = Vec::new();
        for p in &self.plan {
            for (kind, want) in &p.entry.requires {
                if let Some(gap) = self.requirement_rows(
                    kind,
                    want.as_deref(),
                    &p.entry.name,
                    &provided,
                    &mut seen,
                    &mut rows,
                ) {
                    missing.push(gap);
                }
            }
        }
        // HashMap iteration order would otherwise reshuffle the dialog per call.
        rows.sort_by(|a, b| {
            a.get("name").and_then(Value::as_str).cmp(&b.get("name").and_then(Value::as_str))
        });
        (rows, missing)
    }

    fn declared_optional_rows(&self, seen: &mut HashSet<String>) -> Vec<Value> {
        let mut rows = Vec::new();
        for p in &self.plan {
            for (dep_id, _) in &p.entry.optional_depends_on {
                if !seen.insert(dep_id.clone()) {
                    continue;
                }
                if let Some(entry) = self.offerable(dep_id) {
                    rows.push(optional_row(entry, None, &p.entry.name, false));
                }
            }
        }
        rows
    }

    // What the server will provide once this plan lands: the present
    // capabilities plus everything the planned modules declare.
    fn provided_after_plan(&self) -> Vec<(String, String)> {
        self.present_provides
            .iter()
            .cloned()
            .chain(self.plan.iter().flat_map(|p| p.entry.provides.iter().cloned()))
            .collect()
    }

    fn requirement_rows(
        &self,
        kind: &str,
        want: Option<&str>,
        for_name: &str,
        provided: &[(String, String)],
        seen: &mut HashSet<String>,
        rows: &mut Vec<Value>,
    ) -> Option<Value> {
        let matches = |k: &str, id: &str| k == kind && want.is_none_or(|w| w == id);
        if provided.iter().any(|(k, id)| matches(k, id)) {
            return None;
        }
        let candidates: Vec<&CatalogModule> = self
            .by_id
            .values()
            .filter(|e| e.provides.iter().any(|(k, id)| matches(k, id)))
            .filter_map(|e| self.offerable(&e.id))
            .collect();
        if candidates.is_empty() {
            return Some(json!({ "kind": kind, "id": want, "for": for_name }));
        }
        // A lone candidate arrives pre-checked in the dialog: it is the
        // only way to satisfy the requirement.
        let suggested = candidates.len() == 1;
        for entry in candidates {
            if seen.insert(entry.id.clone()) {
                rows.push(optional_row(entry, Some(kind), for_name, suggested));
            }
        }
        None
    }
}

pub(super) fn root_list<'x>(root: &'x str, include: &'x [String]) -> Vec<&'x str> {
    let mut roots = vec![root];
    for id in include {
        if !roots.contains(&id.as_str()) {
            roots.push(id);
        }
    }
    roots
}

fn entry_size(entry: &CatalogModule) -> Option<u64> {
    catalog::pick_artifact(entry).and_then(|a| a.size)
}

// The `{id, name, version, size}` core every plan/brief/opt-in row shares.
fn row_base(entry: &CatalogModule) -> Map<String, Value> {
    let mut row = Map::new();
    row.insert("id".into(), json!(entry.id));
    row.insert("name".into(), json!(entry.name));
    row.insert("version".into(), json!(entry.version));
    row.insert("size".into(), json!(entry_size(entry)));
    row
}

pub(super) fn entry_brief(entry: &CatalogModule) -> Value {
    Value::Object(row_base(entry))
}

pub(super) fn plan_brief(plan: &[Planned<'_>]) -> Value {
    Value::Array(plan.iter().map(|p| entry_brief(p.entry)).collect())
}

fn plan_row(p: &Planned<'_>) -> Value {
    let mut row = row_base(p.entry);
    row.insert("installedVersion".into(), json!(p.installed));
    row.insert("requested".into(), json!(p.requested));
    Value::Object(row)
}

fn optional_row(
    entry: &CatalogModule,
    capability: Option<&str>,
    for_name: &str,
    suggested: bool,
) -> Value {
    let mut row = row_base(entry);
    row.insert("description".into(), json!(entry.description));
    row.insert("capability".into(), json!(capability));
    row.insert("for".into(), json!(for_name));
    row.insert("suggested".into(), json!(suggested));
    Value::Object(row)
}

/// The dry-run behind the install dialog: what installing `root_id` (plus the
/// opted-in `include` extras) would actually pull, and which optional
/// dependencies could ride along. Nothing is downloaded.
pub async fn plan_view(
    state: &SharedState,
    sup: &Arc<Supervisor>,
    root_id: &str,
    include: &[String],
) -> Result<Value> {
    let modules = registries::fetch_merged(state, sup).await?;
    let mut planner = Planner::new(state, &modules);
    planner.roots(&root_list(root_id, include))?;
    let total: u64 = planner.plan.iter().filter_map(|p| entry_size(p.entry)).sum();
    let (optional, missing) = planner.optional();
    Ok(json!({
        "requested": root_id,
        "modules": planner.plan.iter().map(plan_row).collect::<Vec<_>>(),
        "optional": optional,
        "missing": missing,
        "totalSize": total,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::admin::store::catalog::Artifact;

    fn module(id: &str, version: &str) -> CatalogModule {
        CatalogModule {
            artifacts: vec![Artifact {
                target: None,
                url: format!("https://x/{id}.kmod"),
                size: Some(10),
                sha256: Some("00".into()),
            }],
            ..catalog::test_module(id, version)
        }
    }

    fn planner<'a>(modules: &'a [CatalogModule]) -> Planner<'a> {
        Planner::with_present(modules, HashMap::new(), Vec::new())
    }

    #[test]
    fn dependencies_land_before_their_dependents_and_only_roots_are_requested() {
        let mut root = module("tv.x.app", "1.0.0");
        root.depends_on = vec![("tv.x.lib".into(), None)];
        let modules = vec![root, module("tv.x.lib", "1.0.0")];
        let mut p = planner(&modules);
        p.roots(&["tv.x.app"]).unwrap();
        let order: Vec<(&str, bool)> =
            p.plan.iter().map(|x| (x.entry.id.as_str(), x.requested)).collect();
        assert_eq!(order, vec![("tv.x.lib", false), ("tv.x.app", true)]);
    }

    #[test]
    fn a_lone_provider_is_suggested_for_an_unsatisfied_requirement() {
        let mut root = module("tv.x.app", "1.0.0");
        root.requires = vec![("indexer-engine".into(), None)];
        let mut provider = module("tv.x.indexer", "1.0.0");
        provider.provides = vec![("indexer-engine".into(), "builtin".into())];
        let modules = vec![root, provider];
        let mut p = planner(&modules);
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, missing) = p.optional();
        assert!(missing.is_empty());
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].get("id").and_then(Value::as_str), Some("tv.x.indexer"));
        assert_eq!(rows[0].get("capability").and_then(Value::as_str), Some("indexer-engine"));
        assert_eq!(rows[0].get("for").and_then(Value::as_str), Some("tv.x.app"));
        assert_eq!(rows[0].get("suggested").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn competing_providers_are_offered_but_not_suggested() {
        let mut root = module("tv.x.app", "1.0.0");
        root.requires = vec![("download-client".into(), None)];
        let mut a = module("tv.x.engine-a", "1.0.0");
        a.provides = vec![("download-client".into(), "a".into())];
        let mut b = module("tv.x.engine-b", "1.0.0");
        b.provides = vec![("download-client".into(), "b".into())];
        let modules = vec![root, a, b];
        let mut p = planner(&modules);
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, missing) = p.optional();
        assert!(missing.is_empty());
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| r.get("suggested").and_then(Value::as_bool) == Some(false)));
    }

    #[test]
    fn a_requirement_the_plan_itself_satisfies_is_not_suggested() {
        let mut root = module("tv.x.app", "1.0.0");
        root.depends_on = vec![("tv.x.engine".into(), None)];
        root.requires = vec![("download-client".into(), None)];
        let mut dep = module("tv.x.engine", "1.0.0");
        dep.provides = vec![("download-client".into(), "builtin".into())];
        let modules = vec![root, dep];
        let mut p = planner(&modules);
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, missing) = p.optional();
        assert!(rows.is_empty(), "{rows:?}");
        assert!(missing.is_empty());
    }

    #[test]
    fn an_installed_provider_satisfies_a_requirement() {
        let mut root = module("tv.x.app", "1.0.0");
        root.requires = vec![("indexer-engine".into(), None)];
        let modules = vec![root];
        let mut p = Planner::with_present(
            &modules,
            HashMap::from([("tv.x.other".to_string(), "1.0.0".to_string())]),
            vec![("indexer-engine".to_string(), "builtin".to_string())],
        );
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, missing) = p.optional();
        assert!(rows.is_empty());
        assert!(missing.is_empty());
    }

    #[test]
    fn an_unsatisfiable_requirement_is_reported_missing() {
        let mut root = module("tv.x.app", "1.0.0");
        root.requires = vec![("subtitle-engine".into(), Some("whisper".into()))];
        let modules = vec![root];
        let mut p = planner(&modules);
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, missing) = p.optional();
        assert!(rows.is_empty());
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].get("kind").and_then(Value::as_str), Some("subtitle-engine"));
        assert_eq!(missing[0].get("id").and_then(Value::as_str), Some("whisper"));
    }

    #[test]
    fn optional_deps_are_offered_but_installed_ones_are_not() {
        let mut root = module("tv.x.app", "1.0.0");
        root.optional_depends_on = vec![("tv.x.vpn".into(), None), ("tv.x.already".into(), None)];
        let modules = vec![root, module("tv.x.vpn", "1.0.0"), module("tv.x.already", "1.0.0")];
        let mut p = Planner::with_present(
            &modules,
            HashMap::from([("tv.x.already".to_string(), "1.0.0".to_string())]),
            Vec::new(),
        );
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, _) = p.optional();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].get("id").and_then(Value::as_str), Some("tv.x.vpn"));
        assert!(rows[0].get("capability").unwrap().is_null());
    }
}
