//! The install planner: resolve a root's hard `dependencies` closure against what
//! is already present (compiled-in + runtime installed) and the registry
//! catalog, dependencies first, and derive the opt-in rows the install dialog
//! offers (declared optional deps, plus contributors for the points a planned
//! module consumes and nothing answers). Pure plan math: nothing here downloads.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use anyhow::{anyhow, bail, Result};
use kroma_module_supervisor::Supervisor;
use serde_json::{json, Map, Value};

use super::catalog::{self, CatalogModule};
use super::registries;
use crate::state::SharedState;

// This server's version, checked against each entry's `engines.server` range.
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
    // `(point, instance)` the present modules answer, for `consumes`
    // satisfaction. Disabled modules count: the admin can enable them.
    present_answers: Vec<(String, Option<String>)>,
    pub plan: Vec<Planned<'a>>,
    planned: HashSet<String>,
    stack: Vec<String>,
}

impl<'a> Planner<'a> {
    pub(super) fn new(state: &SharedState, modules: &'a [CatalogModule]) -> Self {
        // Everything already on this server (compiled-in roster + installed
        // .kmod), with its version: a satisfied dependency is not reinstalled.
        let manifests = kroma_module_kernel::manifests(state);
        let present_answers = manifests
            .iter()
            .flat_map(|m| m.contributes.iter().map(|c| (c.point.clone(), c.id.clone())))
            .collect();
        let present = manifests.into_iter().map(|m| (m.id, m.version)).collect();
        Self::with_present(modules, present, present_answers)
    }

    fn with_present(
        modules: &'a [CatalogModule],
        present: HashMap<String, String>,
        present_answers: Vec<(String, Option<String>)>,
    ) -> Self {
        Self {
            by_id: modules.iter().map(|m| (m.id.as_str(), m)).collect(),
            present,
            present_answers,
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
        if let Err(reason) = kroma_module_manifest::engines_satisfied(&entry.engines, SERVER_VERSION)
        {
            bail!("'{id}' {reason}");
        }
        if catalog::pick_artifact(entry).is_none() {
            bail!("'{id}' has no build for this server's platform");
        }
        self.stack.push(id.to_string());
        for (dep_id, range) in &entry.dependencies {
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

    /// The install dialog's opt-in rows: declared `optionalDependencies` targets,
    /// plus, for every point a planned module `consumes` that nothing installed
    /// or planned answers, the catalog's compatible contributors. The second list
    /// is the needs no available module can satisfy.
    fn optional(&self) -> (Vec<Value>, Vec<Value>) {
        let mut seen = HashSet::new();
        let mut rows = self.declared_optional_rows(&mut seen);
        let answered = self.answered_after_plan();
        let mut missing = Vec::new();
        for p in &self.plan {
            for (point, want) in &p.entry.consumes {
                if let Some(gap) = self.need_rows(
                    point,
                    want.as_deref(),
                    &p.entry.name,
                    &answered,
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
            for (dep_id, _) in &p.entry.optional_dependencies {
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

    // What the server will answer once this plan lands: what is present plus
    // everything the planned modules declare.
    fn answered_after_plan(&self) -> Vec<(String, Option<String>)> {
        self.present_answers
            .iter()
            .cloned()
            .chain(self.plan.iter().flat_map(|p| p.entry.contributes.iter().cloned()))
            .collect()
    }

    fn need_rows(
        &self,
        point: &str,
        want: Option<&str>,
        for_name: &str,
        answered: &[(String, Option<String>)],
        seen: &mut HashSet<String>,
        rows: &mut Vec<Value>,
    ) -> Option<Value> {
        // A need naming no instance takes any contributor; one that names an
        // instance is answered only by that instance.
        let matches = |p: &str, id: Option<&str>| {
            p == point && want.is_none_or(|w| id == Some(w))
        };
        if answered.iter().any(|(p, id)| matches(p, id.as_deref())) {
            return None;
        }
        let candidates: Vec<&CatalogModule> = self
            .by_id
            .values()
            .filter(|e| e.contributes.iter().any(|(p, id)| matches(p, id.as_deref())))
            .filter_map(|e| self.offerable(&e.id))
            .collect();
        if candidates.is_empty() {
            return Some(json!({ "point": point, "id": want, "for": for_name }));
        }
        // A lone candidate arrives pre-checked in the dialog: it is the only way
        // to answer the need.
        let suggested = candidates.len() == 1;
        for entry in candidates {
            if seen.insert(entry.id.clone()) {
                rows.push(optional_row(entry, Some(point), for_name, suggested));
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
    point: Option<&str>,
    for_name: &str,
    suggested: bool,
) -> Value {
    let mut row = row_base(entry);
    row.insert("description".into(), json!(entry.description));
    row.insert("point".into(), json!(point));
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
        root.dependencies = vec![("tv.x.lib".into(), None)];
        let modules = vec![root, module("tv.x.lib", "1.0.0")];
        let mut p = planner(&modules);
        p.roots(&["tv.x.app"]).unwrap();
        let order: Vec<(&str, bool)> =
            p.plan.iter().map(|x| (x.entry.id.as_str(), x.requested)).collect();
        assert_eq!(order, vec![("tv.x.lib", false), ("tv.x.app", true)]);
    }

    #[test]
    fn a_lone_contributor_is_suggested_for_an_unanswered_point() {
        let mut root = module("tv.x.app", "1.0.0");
        root.consumes = vec![("tv.kroma.indexer/search".into(), None)];
        let mut provider = module("tv.x.indexer", "1.0.0");
        provider.contributes = vec![("tv.kroma.indexer/search".into(), Some("builtin".into()))];
        let modules = vec![root, provider];
        let mut p = planner(&modules);
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, missing) = p.optional();
        assert!(missing.is_empty());
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].get("id").and_then(Value::as_str), Some("tv.x.indexer"));
        assert_eq!(
            rows[0].get("point").and_then(Value::as_str),
            Some("tv.kroma.indexer/search")
        );
        assert_eq!(rows[0].get("for").and_then(Value::as_str), Some("tv.x.app"));
        assert_eq!(rows[0].get("suggested").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn competing_contributors_are_offered_but_not_suggested() {
        let mut root = module("tv.x.app", "1.0.0");
        root.consumes = vec![("tv.kroma.torrents/download-client".into(), None)];
        let mut a = module("tv.x.engine-a", "1.0.0");
        a.contributes = vec![("tv.kroma.torrents/download-client".into(), Some("a".into()))];
        let mut b = module("tv.x.engine-b", "1.0.0");
        b.contributes = vec![("tv.kroma.torrents/download-client".into(), Some("b".into()))];
        let modules = vec![root, a, b];
        let mut p = planner(&modules);
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, missing) = p.optional();
        assert!(missing.is_empty());
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| r.get("suggested").and_then(Value::as_bool) == Some(false)));
    }

    #[test]
    fn a_point_the_plan_itself_answers_is_not_suggested() {
        let mut root = module("tv.x.app", "1.0.0");
        root.dependencies = vec![("tv.x.engine".into(), None)];
        root.consumes = vec![("tv.kroma.torrents/download-client".into(), None)];
        let mut dep = module("tv.x.engine", "1.0.0");
        dep.contributes = vec![("tv.kroma.torrents/download-client".into(), Some("builtin".into()))];
        let modules = vec![root, dep];
        let mut p = planner(&modules);
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, missing) = p.optional();
        assert!(rows.is_empty(), "{rows:?}");
        assert!(missing.is_empty());
    }

    #[test]
    fn an_installed_contributor_answers_a_consumed_point() {
        let mut root = module("tv.x.app", "1.0.0");
        root.consumes = vec![("tv.kroma.indexer/search".into(), None)];
        let modules = vec![root];
        let mut p = Planner::with_present(
            &modules,
            HashMap::from([("tv.x.other".to_string(), "1.0.0".to_string())]),
            vec![("tv.kroma.indexer/search".to_string(), Some("builtin".to_string()))],
        );
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, missing) = p.optional();
        assert!(rows.is_empty());
        assert!(missing.is_empty());
    }

    #[test]
    fn an_unanswerable_point_is_reported_missing() {
        let mut root = module("tv.x.app", "1.0.0");
        root.consumes = vec![("tv.kroma.whisper/transcribe".into(), Some("whisper".into()))];
        let modules = vec![root];
        let mut p = planner(&modules);
        p.roots(&["tv.x.app"]).unwrap();
        let (rows, missing) = p.optional();
        assert!(rows.is_empty());
        assert_eq!(missing.len(), 1);
        assert_eq!(
            missing[0].get("point").and_then(Value::as_str),
            Some("tv.kroma.whisper/transcribe")
        );
        assert_eq!(missing[0].get("id").and_then(Value::as_str), Some("whisper"));
    }

    #[test]
    fn a_shared_dependency_is_planned_once_for_two_dependents() {
        let mut a = module("tv.x.a", "1.0.0");
        a.dependencies = vec![("tv.x.lib".into(), None)];
        let mut b = module("tv.x.b", "1.0.0");
        b.dependencies = vec![("tv.x.lib".into(), None)];
        let modules = vec![a, b, module("tv.x.lib", "1.0.0")];
        let mut p = planner(&modules);
        p.roots(&["tv.x.a", "tv.x.b"]).unwrap();
        let order: Vec<&str> = p.plan.iter().map(|x| x.entry.id.as_str()).collect();
        assert_eq!(order, vec!["tv.x.lib", "tv.x.a", "tv.x.b"]);
    }

    #[test]
    fn a_dependency_cycle_is_refused_by_name_rather_than_recursed_into() {
        let mut a = module("tv.x.a", "1.0.0");
        a.dependencies = vec![("tv.x.b".into(), None)];
        let mut b = module("tv.x.b", "1.0.0");
        b.dependencies = vec![("tv.x.a".into(), None)];
        let modules = vec![a, b];
        let mut p = planner(&modules);
        let err = p.roots(&["tv.x.a"]).unwrap_err().to_string();
        assert!(err.contains("cycle"), "{err}");
    }

    #[test]
    fn a_missing_root_and_a_missing_dependency_say_different_things() {
        let modules = vec![module("tv.x.app", "1.0.0")];
        let err = planner(&modules).roots(&["tv.x.absent"]).unwrap_err().to_string();
        assert_eq!(err, "'tv.x.absent' is not in the registry");

        let mut root = module("tv.x.app", "1.0.0");
        root.dependencies = vec![("tv.x.absent".into(), None)];
        let modules = vec![root];
        let err = planner(&modules).roots(&["tv.x.app"]).unwrap_err().to_string();
        assert_eq!(err, "dependency 'tv.x.absent' is neither installed nor in the registry");
    }

    #[test]
    fn a_module_this_server_is_too_old_for_blocks_the_plan_up_front() {
        let mut root = module("tv.x.app", "1.0.0");
        root.engines.insert("server".into(), ">=999.0.0".into());
        let modules = vec![root];
        let err = planner(&modules).roots(&["tv.x.app"]).unwrap_err().to_string();
        assert!(err.contains("requires server >=999.0.0"), "{err}");
        assert!(err.contains("this server is"), "{err}");
    }

    #[test]
    fn a_module_with_no_build_for_this_platform_blocks_the_plan_up_front() {
        let modules = vec![catalog::test_module("tv.x.app", "1.0.0")];
        let err = planner(&modules).roots(&["tv.x.app"]).unwrap_err().to_string();
        assert_eq!(err, "'tv.x.app' has no build for this server's platform");
    }

    #[test]
    fn a_dependency_already_installed_in_range_is_not_reinstalled() {
        let mut root = module("tv.x.app", "1.0.0");
        root.dependencies = vec![("tv.x.lib".into(), Some("^1.0.0".into()))];
        let modules = vec![root, module("tv.x.lib", "1.2.0")];
        let mut p = Planner::with_present(
            &modules,
            HashMap::from([("tv.x.lib".to_string(), "1.1.0".to_string())]),
            Vec::new(),
        );
        p.roots(&["tv.x.app"]).unwrap();
        let order: Vec<&str> = p.plan.iter().map(|x| x.entry.id.as_str()).collect();
        assert_eq!(order, vec!["tv.x.app"]);
    }

    #[test]
    fn a_registry_copy_that_misses_the_declared_range_is_refused_before_installing_it() {
        let mut root = module("tv.x.app", "1.0.0");
        root.dependencies = vec![("tv.x.lib".into(), Some("^2.0.0".into()))];
        let modules = vec![root, module("tv.x.lib", "1.0.0")];
        let err = planner(&modules).roots(&["tv.x.app"]).unwrap_err().to_string();
        assert_eq!(err, "'tv.x.app' needs tv.x.lib@^2.0.0 but the registry has 1.0.0");
    }

    #[test]
    fn an_optional_dependency_two_modules_name_is_offered_once() {
        let mut a = module("tv.x.a", "1.0.0");
        a.optional_dependencies = vec![("tv.x.vpn".into(), None)];
        let mut b = module("tv.x.b", "1.0.0");
        b.optional_dependencies = vec![("tv.x.vpn".into(), None)];
        let modules = vec![a, b, module("tv.x.vpn", "1.0.0")];
        let mut p = planner(&modules);
        p.roots(&["tv.x.a", "tv.x.b"]).unwrap();
        let (rows, _) = p.optional();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].get("for").and_then(Value::as_str), Some("tv.x.a"));
    }

    #[test]
    fn the_extra_roots_join_the_plan_without_repeating_the_one_asked_for() {
        let requested = "tv.x.app".to_string();
        let include = vec![requested.clone(), "tv.x.extra".to_string()];
        assert_eq!(root_list(&requested, &include), vec!["tv.x.app", "tv.x.extra"]);
    }

    #[test]
    fn a_plan_row_states_what_is_installed_and_what_was_asked_for() {
        let mut root = module("tv.x.app", "1.0.0");
        root.dependencies = vec![("tv.x.lib".into(), None)];
        let modules = vec![root, module("tv.x.lib", "1.0.0")];
        let mut p = Planner::with_present(
            &modules,
            HashMap::from([("tv.x.app".to_string(), "0.9.0".to_string())]),
            Vec::new(),
        );
        p.roots(&["tv.x.app"]).unwrap();
        let rows: Vec<Value> = p.plan.iter().map(plan_row).collect();
        assert_eq!(rows[0].get("id").and_then(Value::as_str), Some("tv.x.lib"));
        assert!(rows[0].get("installedVersion").unwrap().is_null());
        assert_eq!(rows[0].get("requested").and_then(Value::as_bool), Some(false));
        assert_eq!(rows[1].get("installedVersion").and_then(Value::as_str), Some("0.9.0"));
        assert_eq!(rows[1].get("requested").and_then(Value::as_bool), Some(true));
        assert_eq!(rows[1].get("size").and_then(Value::as_u64), Some(10));

        let brief = plan_brief(&p.plan);
        let first = &brief.as_array().unwrap()[0];
        assert_eq!(first.get("id").and_then(Value::as_str), Some("tv.x.lib"));
        assert!(first.get("installedVersion").is_none());
        assert_eq!(entry_brief(&modules[1]), *first);
    }

    #[test]
    fn a_module_with_no_artifact_reports_no_size() {
        let bare = catalog::test_module("tv.x.app", "1.0.0");
        assert!(entry_brief(&bare).get("size").unwrap().is_null());
    }

    #[test]
    fn optional_deps_are_offered_but_installed_ones_are_not() {
        let mut root = module("tv.x.app", "1.0.0");
        root.optional_dependencies = vec![("tv.x.vpn".into(), None), ("tv.x.already".into(), None)];
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
        assert!(rows[0].get("point").unwrap().is_null());
    }
}
