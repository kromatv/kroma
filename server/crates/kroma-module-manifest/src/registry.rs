//! The module registry: gathering, dependency resolution, point lookup.

use std::collections::{HashMap, HashSet};
use std::fmt;

use crate::manifest::{Contribution, Dependency, ModuleManifest, PointReq};
use crate::Module;

/// Handed to [`Module::register`](crate::Module::register) so a module can record
/// what it contributes; everything recorded is attributed to that module.
#[derive(Default)]
pub struct ModuleRegistration {
    contributions: Vec<Contribution>,
}

impl ModuleRegistration {
    /// Answer a point under an instance name, e.g.
    /// `reg.contribute("tv.kroma.torrents/download-client", "rqbit")`.
    pub fn contribute(&mut self, point: impl Into<String>, id: impl Into<String>) -> &mut Self {
        self.contributions.push(Contribution::instance(point, id));
        self
    }

    pub fn contributions(&self) -> &[Contribution] {
        &self.contributions
    }
}

struct Entry {
    manifest: ModuleManifest,
    module: Box<dyn Module>,
}

/// Why a module graph could not be brought up.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolveError {
    MissingDependency {
        module: String,
        needs: String,
    },
    VersionMismatch {
        module: String,
        needs: String,
        req: String,
        found: String,
    },
    UnmetPoint {
        module: String,
        point: String,
        id: Option<String>,
    },
    DuplicateId(String),
    Cycle(Vec<String>),
}

impl fmt::Display for ResolveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ResolveError::MissingDependency { module, needs } => {
                write!(
                    f,
                    "module {module:?} depends on {needs:?}, which is not registered"
                )
            }
            ResolveError::VersionMismatch {
                module,
                needs,
                req,
                found,
            } => write!(
                f,
                "module {module:?} needs {needs:?} {req} but {found} is registered",
            ),
            ResolveError::UnmetPoint { module, point, id } => match id {
                Some(id) => write!(
                    f,
                    "{module} needs {point} answered under {id}, and nothing does"
                ),
                None => write!(f, "{module} needs {point} answered, and nothing does"),
            },
            ResolveError::DuplicateId(id) => write!(f, "two modules registered the id {id:?}"),
            ResolveError::Cycle(ids) => write!(f, "module dependency cycle among {ids:?}"),
        }
    }
}

impl std::error::Error for ResolveError {}

/// The set of modules the host knows about.
#[derive(Default)]
pub struct Registry {
    entries: Vec<Entry>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a module; its [`register`](crate::Module::register) hook runs immediately
    /// so the capabilities land on its manifest.
    pub fn register(&mut self, module: Box<dyn Module>) -> &mut Self {
        let mut reg = ModuleRegistration::default();
        module.register(&mut reg);
        let mut manifest = module.manifest();
        // A module that declares `contributes` in its module.json and keeps the
        // default no-op register() keeps them.
        if !reg.contributions.is_empty() {
            manifest.contributes = reg.contributions;
        }
        self.entries.push(Entry { manifest, module });
        self
    }

    /// Every module manifest, in registration order.
    pub fn manifests(&self) -> Vec<ModuleManifest> {
        self.entries.iter().map(|e| e.manifest.clone()).collect()
    }

    /// The module answering `point` under `id`.
    pub fn contributor_of(&self, point: &str, id: &str) -> Option<&ModuleManifest> {
        self.entries.iter().map(|e| &e.manifest).find(|m| {
            m.contributes
                .iter()
                .any(|c| c.point == point && c.id.as_deref() == Some(id))
        })
    }

    pub fn icon_of(&self, id: &str) -> Option<crate::ModuleIcon> {
        self.entries
            .iter()
            .find(|e| e.manifest.id == id)
            .and_then(|e| e.module.icon())
    }

    /// Validate the graph and return module ids in initialization order
    /// (dependencies first).
    pub fn resolve(&self) -> Result<Vec<String>, ResolveError> {
        let mut seen = HashSet::new();
        for e in &self.entries {
            if !seen.insert(e.manifest.id.as_str()) {
                return Err(ResolveError::DuplicateId(e.manifest.id.clone()));
            }
        }
        let edges = self.dependency_edges()?;
        self.topo_sort(&edges)
    }

    fn dependency_edges(&self) -> Result<HashMap<String, Vec<String>>, ResolveError> {
        let index: HashMap<&str, &ModuleManifest> = self
            .entries
            .iter()
            .map(|e| (e.manifest.id.as_str(), &e.manifest))
            .collect();
        let mut edges: HashMap<String, Vec<String>> = HashMap::new();
        for e in &self.entries {
            let m = &e.manifest;
            let deps = self.module_deps(m, &index)?;
            edges.insert(m.id.clone(), deps);
        }
        Ok(edges)
    }

    fn module_deps(
        &self,
        m: &ModuleManifest,
        index: &HashMap<&str, &ModuleManifest>,
    ) -> Result<Vec<String>, ResolveError> {
        let mut deps: Vec<String> = Vec::new();
        for dep in &m.dependencies {
            match index.get(dep.id.as_str()) {
                None => {
                    return Err(ResolveError::MissingDependency {
                        module: m.id.clone(),
                        needs: dep.id.clone(),
                    })
                }
                Some(target) => {
                    check_version(m, dep, target)?;
                    deps.push(dep.id.clone());
                }
            }
        }
        for dep in &m.optional_dependencies {
            if let Some(target) = index.get(dep.id.as_str()) {
                check_version(m, dep, target)?;
                deps.push(dep.id.clone());
            }
        }
        for req in &m.consumes {
            match self.contributor_for(req) {
                // An optional need going unmet is not an error: the module runs
                // without it, which is the whole reason it said so.
                None if req.optional => {}
                None => {
                    return Err(ResolveError::UnmetPoint {
                        module: m.id.clone(),
                        point: req.point.clone(),
                        id: req.id.clone(),
                    })
                }
                Some(provider) if provider != m.id => deps.push(provider),
                _ => {} // answered by itself: no edge
            }
        }
        deps.sort();
        deps.dedup();
        Ok(deps)
    }

    fn contributor_for(&self, req: &PointReq) -> Option<String> {
        self.entries
            .iter()
            .find(|e| {
                e.manifest.contributes.iter().any(|c| {
                    c.point == req.point
                        && req
                            .id
                            .as_deref()
                            .is_none_or(|id| c.id.as_deref() == Some(id))
                })
            })
            .map(|e| e.manifest.id.clone())
    }

    // Ready nodes are drained in registration order, so the output is deterministic.
    fn topo_sort(&self, edges: &HashMap<String, Vec<String>>) -> Result<Vec<String>, ResolveError> {
        let ids: Vec<&str> = self
            .entries
            .iter()
            .map(|e| e.manifest.id.as_str())
            .collect();
        let mut indegree: HashMap<&str, usize> = ids.iter().map(|&id| (id, 0usize)).collect();
        let mut dependents: HashMap<&str, Vec<&str>> = HashMap::new();
        for e in &self.entries {
            let m = e.manifest.id.as_str();
            for dep in edges.get(m).into_iter().flatten() {
                *indegree.get_mut(m).unwrap() += 1;
                dependents.entry(dep.as_str()).or_default().push(m);
            }
        }

        let mut queue: Vec<&str> = ids.iter().copied().filter(|id| indegree[id] == 0).collect();
        let mut order: Vec<String> = Vec::with_capacity(self.entries.len());
        let mut cursor = 0;
        while cursor < queue.len() {
            let m = queue[cursor];
            cursor += 1;
            order.push(m.to_string());
            if let Some(deps) = dependents.get(m) {
                for &d in deps {
                    let n = indegree.get_mut(d).unwrap();
                    *n -= 1;
                    if *n == 0 {
                        queue.push(d);
                    }
                }
            }
        }

        if order.len() != self.entries.len() {
            let stuck: Vec<String> = ids
                .iter()
                .filter(|id| !order.iter().any(|o| o == *id))
                .map(ToString::to_string)
                .collect();
            return Err(ResolveError::Cycle(stuck));
        }
        Ok(order)
    }
}

// Ranges use dtolnay `semver` syntax, NOT npm wildcard forms like `1.x`. Permissive
// on purpose: an unparseable range or target version is ignored rather than taking
// the whole module graph down.
fn check_version(
    module: &ModuleManifest,
    dep: &Dependency,
    target: &ModuleManifest,
) -> Result<(), ResolveError> {
    let Some(range) = &dep.version else {
        return Ok(());
    };
    if let (Ok(req), Ok(found)) = (
        semver::VersionReq::parse(range),
        semver::Version::parse(&target.version),
    ) {
        if !req.matches(&found) {
            return Err(ResolveError::VersionMismatch {
                module: module.id.clone(),
                needs: dep.id.clone(),
                req: range.clone(),
                found: target.version.clone(),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ModuleManifest;

    struct Fake {
        manifest: ModuleManifest,
        contributes: Vec<(&'static str, &'static str)>,
    }

    impl Fake {
        fn boxed(
            id: &str,
            deps: &[&str],
            contributes: &[(&'static str, &'static str)],
        ) -> Box<dyn Module> {
            let mut manifest = ModuleManifest::new(id, id, "0.1.0");
            for d in deps {
                manifest = manifest.needs(*d);
            }
            Box::new(Fake {
                manifest,
                contributes: contributes.to_vec(),
            })
        }
    }

    impl Module for Fake {
        fn manifest(&self) -> ModuleManifest {
            self.manifest.clone()
        }
        fn register(&self, reg: &mut ModuleRegistration) {
            for (point, id) in &self.contributes {
                reg.contribute(*point, *id);
            }
        }
    }

    fn req(point: &str) -> PointReq {
        PointReq {
            point: point.into(),
            version: None,
            id: None,
            optional: false,
        }
    }

    fn index_of(order: &[String], id: &str) -> usize {
        order
            .iter()
            .position(|o| o == id)
            .expect("id present in order")
    }

    #[test]
    fn resolves_dependencies_before_dependents() {
        let mut reg = Registry::new();
        reg.register(Fake::boxed("a", &["b"], &[]));
        reg.register(Fake::boxed("b", &["c"], &[]));
        reg.register(Fake::boxed("c", &[], &[]));

        let order = reg.resolve().expect("graph resolves");
        assert!(index_of(&order, "c") < index_of(&order, "b"));
        assert!(index_of(&order, "b") < index_of(&order, "a"));
    }

    #[test]
    fn missing_dependency_is_reported() {
        let mut reg = Registry::new();
        reg.register(Fake::boxed("torrents", &["nope"], &[]));
        assert_eq!(
            reg.resolve(),
            Err(ResolveError::MissingDependency {
                module: "torrents".into(),
                needs: "nope".into(),
            })
        );
    }

    #[test]
    fn duplicate_id_is_reported() {
        let mut reg = Registry::new();
        reg.register(Fake::boxed("dup", &[], &[]));
        reg.register(Fake::boxed("dup", &[], &[]));
        assert_eq!(reg.resolve(), Err(ResolveError::DuplicateId("dup".into())));
    }

    #[test]
    fn cycle_is_reported() {
        let mut reg = Registry::new();
        reg.register(Fake::boxed("a", &["b"], &[]));
        reg.register(Fake::boxed("b", &["a"], &[]));
        match reg.resolve() {
            Err(ResolveError::Cycle(ids)) => {
                assert!(ids.contains(&"a".to_string()) && ids.contains(&"b".to_string()));
            }
            other => panic!("expected a cycle, got {other:?}"),
        }
    }

    #[test]
    fn register_populates_contributions_and_lookup() {
        let mut reg = Registry::new();
        reg.register(Fake::boxed(
            "torrents",
            &[],
            &[
                ("tv.kroma.torrents/download-client", "rqbit"),
                ("tv.kroma.torrents/download-client", "transmission"),
            ],
        ));

        let manifests = reg.manifests();
        assert_eq!(manifests[0].contributes.len(), 2);
        assert_eq!(
            reg.contributor_of("tv.kroma.torrents/download-client", "rqbit")
                .unwrap()
                .id,
            "torrents"
        );
        assert!(reg
            .contributor_of("tv.kroma.torrents/download-client", "nope")
            .is_none());
    }

    fn boxed_manifest(manifest: ModuleManifest) -> Box<dyn Module> {
        Box::new(Fake {
            manifest,
            contributes: Vec::new(),
        })
    }

    #[test]
    fn version_range_is_enforced() {
        let mut ok = Registry::new();
        ok.register(Fake::boxed("lib", &[], &[])); // version 0.1.0
        let mut app = ModuleManifest::new("app", "app", "1.0.0");
        app.dependencies.push(Dependency {
            id: "lib".into(),
            version: Some(">=0.1".into()),
        });
        ok.register(boxed_manifest(app));
        assert!(ok.resolve().is_ok());

        let mut bad = Registry::new();
        bad.register(Fake::boxed("lib", &[], &[])); // version 0.1.0
        let mut app = ModuleManifest::new("app", "app", "1.0.0");
        app.dependencies.push(Dependency {
            id: "lib".into(),
            version: Some("^2".into()),
        });
        bad.register(boxed_manifest(app));
        assert!(matches!(
            bad.resolve(),
            Err(ResolveError::VersionMismatch { .. })
        ));
    }

    #[test]
    fn optional_dep_is_skipped_when_absent_and_ordered_when_present() {
        let mut reg = Registry::new();
        let mut app = ModuleManifest::new("app", "app", "1.0.0");
        app.optional_dependencies.push(Dependency::new("maybe"));
        reg.register(boxed_manifest(app));
        assert!(reg.resolve().is_ok());

        let mut reg = Registry::new();
        let mut app = ModuleManifest::new("app", "app", "1.0.0");
        app.optional_dependencies.push(Dependency::new("maybe"));
        reg.register(boxed_manifest(app));
        reg.register(Fake::boxed("maybe", &[], &[]));
        let order = reg.resolve().expect("resolves");
        assert!(index_of(&order, "maybe") < index_of(&order, "app"));
    }

    #[test]
    fn a_consumed_point_orders_its_contributor_first() {
        let mut reg = Registry::new();
        reg.register(Fake::boxed(
            "engine",
            &[],
            &[("tv.kroma.torrents/download-client", "rqbit")],
        ));
        let mut app = ModuleManifest::new("app", "app", "1.0.0");
        app.consumes.push(req("tv.kroma.torrents/download-client"));
        reg.register(boxed_manifest(app));
        let order = reg.resolve().expect("resolves");
        assert!(index_of(&order, "engine") < index_of(&order, "app"));

        let mut reg = Registry::new();
        let mut app = ModuleManifest::new("app", "app", "1.0.0");
        app.consumes.push(req("tv.kroma.torrents/download-client"));
        reg.register(boxed_manifest(app));
        assert!(matches!(
            reg.resolve(),
            Err(ResolveError::UnmetPoint { .. })
        ));
    }

    #[test]
    fn a_module_that_answers_what_it_consumes_is_not_a_cycle() {
        let mut reg = Registry::new();
        reg.register(Fake::boxed("indexers", &[], &[("indexer", "torznab")]));
        let mut manifest = ModuleManifest::new("indexers", "indexers", "0.1.0");
        manifest.consumes.push(req("tv.kroma.indexer/search"));

        let mut solo = Registry::new();
        solo.register(Box::new(Fake {
            manifest,
            contributes: vec![("tv.kroma.indexer/search", "torznab")],
        }));
        assert_eq!(
            solo.resolve()
                .expect("a self-provided capability adds no edge"),
            vec!["indexers"]
        );
    }

    #[test]
    fn an_unreadable_version_on_either_side_is_ignored_rather_than_failing_the_graph() {
        let mut unreadable_range = Registry::new();
        unreadable_range.register(Fake::boxed("lib", &[], &[]));
        let mut app = ModuleManifest::new("app", "app", "1.0.0");
        app.dependencies.push(Dependency {
            id: "lib".into(),
            version: Some("latest".into()),
        });
        unreadable_range.register(boxed_manifest(app));
        assert!(unreadable_range.resolve().is_ok());

        let mut unreadable_target = Registry::new();
        unreadable_target.register(boxed_manifest(ModuleManifest::new("lib", "lib", "nightly")));
        let mut app = ModuleManifest::new("app", "app", "1.0.0");
        app.dependencies.push(Dependency {
            id: "lib".into(),
            version: Some("^1".into()),
        });
        unreadable_target.register(boxed_manifest(app));
        assert!(unreadable_target.resolve().is_ok());
    }

    #[test]
    fn a_module_without_a_packaged_icon_reports_none() {
        let mut reg = Registry::new();
        reg.register(Fake::boxed("plain", &[], &[]));
        assert!(reg.icon_of("plain").is_none());
        assert!(reg.icon_of("unknown").is_none());
    }

    #[test]
    fn registration_collects_the_contributions_in_declaration_order() {
        let mut reg = ModuleRegistration::default();
        reg.contribute("tv.kroma.torrents/download-client", "rqbit")
            .contribute("tv.kroma.indexer/search", "torznab");

        let points: Vec<&str> = reg
            .contributions()
            .iter()
            .map(|c| c.point.as_str())
            .collect();

        assert_eq!(
            points,
            vec![
                "tv.kroma.torrents/download-client",
                "tv.kroma.indexer/search"
            ]
        );
        assert_eq!(reg.contributions()[1].id.as_deref(), Some("torznab"));
        // The local half is what the wire path is built from.
        assert_eq!(reg.contributions()[0].local(), "download-client");
    }

    #[test]
    fn every_resolve_error_says_which_module_and_what_it_wanted() {
        let missing = ResolveError::MissingDependency {
            module: "acquisition".into(),
            needs: "torrents".into(),
        };
        assert_eq!(
            missing.to_string(),
            r#"module "acquisition" depends on "torrents", which is not registered"#
        );

        let mismatch = ResolveError::VersionMismatch {
            module: "acquisition".into(),
            needs: "torrents".into(),
            req: "^2".into(),
            found: "0.1.0".into(),
        };
        assert_eq!(
            mismatch.to_string(),
            r#"module "acquisition" needs "torrents" ^2 but 0.1.0 is registered"#
        );

        let any = ResolveError::UnmetPoint {
            module: "acquisition".into(),
            point: "tv.kroma.torrents/download-client".into(),
            id: None,
        };
        assert_eq!(
            any.to_string(),
            "acquisition needs tv.kroma.torrents/download-client answered, and nothing does"
        );

        // Named, because a point several modules answer is unmet by the WRONG one
        // answering it, and the message has to say which was wanted.
        let named = ResolveError::UnmetPoint {
            module: "acquisition".into(),
            point: "tv.kroma.torrents/download-client".into(),
            id: Some("rqbit".into()),
        };
        assert_eq!(
            named.to_string(),
            "acquisition needs tv.kroma.torrents/download-client answered under rqbit, and nothing does"
        );

        assert_eq!(
            ResolveError::DuplicateId("tv.kroma.torrents".into()).to_string(),
            r#"two modules registered the id "tv.kroma.torrents""#
        );
        assert_eq!(
            ResolveError::Cycle(vec!["a".into(), "b".into()]).to_string(),
            r#"module dependency cycle among ["a", "b"]"#
        );
    }
}
