use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Deserialize;

use crate::Error;

/// The fields of `cargo metadata --format-version 1` the notices read.
#[derive(Debug, Deserialize)]
pub struct Metadata {
    pub packages: Vec<Package>,
    pub resolve: Resolve,
}

/// One package of the graph, as its manifest declares it.
#[derive(Debug, Clone, Deserialize)]
pub struct Package {
    pub id: String,
    pub name: String,
    pub version: String,
    pub license: Option<String>,
    pub license_file: Option<String>,
    pub repository: Option<String>,
    pub homepage: Option<String>,
    #[serde(default)]
    pub authors: Vec<String>,
    pub manifest_path: PathBuf,
    /// `None` for a member of the workspace being read.
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Resolve {
    pub root: Option<String>,
    pub nodes: Vec<Node>,
}

#[derive(Debug, Deserialize)]
pub struct Node {
    pub id: String,
    pub deps: Vec<Dep>,
}

#[derive(Debug, Deserialize)]
pub struct Dep {
    pub pkg: String,
    pub dep_kinds: Vec<DepKind>,
}

#[derive(Debug, Deserialize)]
pub struct DepKind {
    pub kind: Option<String>,
}

impl Metadata {
    /// Runs `cargo metadata` offline on `manifest`, narrowed to what `target`
    /// builds, so a platform the program never runs on adds nothing.
    pub fn read(cargo: &Path, manifest: &Path, target: &str) -> Result<Self, Error> {
        let output = Command::new(cargo)
            .args(["metadata", "--format-version", "1", "--locked", "--offline"])
            .args(["--filter-platform", target, "--manifest-path"])
            .arg(manifest)
            .output()
            .map_err(Error::Io)?;
        if !output.status.success() {
            return Err(Error::Cargo(String::from_utf8_lossy(&output.stderr).into_owned()));
        }
        serde_json::from_slice(&output.stdout).map_err(Error::Json)
    }

    /// The third-party crates the root links: those it reaches through normal
    /// dependencies, never only a build or dev one, less the workspace's own.
    pub fn linked(&self) -> Vec<&Package> {
        let reached = self.reached();
        self.packages
            .iter()
            .filter(|pkg| pkg.source.is_some() && reached.contains(pkg.id.as_str()))
            .collect()
    }

    fn reached(&self) -> HashSet<&str> {
        let nodes: HashMap<&str, &Node> =
            self.resolve.nodes.iter().map(|node| (node.id.as_str(), node)).collect();
        let mut seen: HashSet<&str> = self.resolve.root.as_deref().into_iter().collect();
        let mut queue: VecDeque<&str> = seen.iter().copied().collect();
        while let Some(id) = queue.pop_front() {
            for dep in nodes.get(id).map_or(&[][..], |node| &node.deps) {
                if dep.is_normal() && seen.insert(dep.pkg.as_str()) {
                    queue.push_back(dep.pkg.as_str());
                }
            }
        }
        seen
    }
}

impl Dep {
    fn is_normal(&self) -> bool {
        self.dep_kinds.iter().any(|kind| kind.kind.is_none())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn graph() -> Metadata {
        serde_json::from_value(serde_json::json!({
            "packages": [
                package("app", None),
                package("serde", Some("registry")),
                package("cc", Some("registry")),
                package("proptest", Some("registry")),
                package("itoa", Some("registry")),
                package("helper", None),
            ],
            "resolve": {
                "root": "app",
                "nodes": [
                    { "id": "app", "deps": [
                        dep("serde", None), dep("cc", Some("build")),
                        dep("proptest", Some("dev")), dep("helper", None),
                    ]},
                    { "id": "serde", "deps": [dep("itoa", None)] },
                    { "id": "helper", "deps": [] },
                ],
            },
        }))
        .unwrap()
    }

    fn package(name: &str, source: Option<&str>) -> serde_json::Value {
        serde_json::json!({
            "id": name, "name": name, "version": "1.0.0", "license": "MIT",
            "license_file": null, "repository": null, "homepage": null,
            "manifest_path": format!("/registry/{name}/Cargo.toml"), "source": source,
        })
    }

    fn dep(pkg: &str, kind: Option<&str>) -> serde_json::Value {
        serde_json::json!({ "pkg": pkg, "dep_kinds": [{ "kind": kind }] })
    }

    fn names(packages: Vec<&Package>) -> Vec<&str> {
        packages.into_iter().map(|pkg| pkg.name.as_str()).collect()
    }

    #[test]
    fn lists_the_crates_reached_through_normal_dependencies() {
        let metadata = graph();

        let linked = metadata.linked();

        assert_eq!(names(linked), vec!["serde", "itoa"]);
    }

    #[test]
    fn lists_nothing_without_a_root() {
        let mut metadata = graph();
        metadata.resolve.root = None;

        let linked = metadata.linked();

        assert!(linked.is_empty());
    }

    #[test]
    fn reports_a_cargo_that_cannot_run() {
        let missing = Path::new("/nonexistent/cargo");

        let result = Metadata::read(missing, Path::new("Cargo.toml"), "x86_64-unknown-linux-gnu");

        assert!(matches!(result, Err(Error::Io(_))));
    }

    #[test]
    fn reports_cargo_refusing_the_manifest() {
        let cargo = std::env::var_os("CARGO").map_or_else(|| PathBuf::from("cargo"), PathBuf::from);
        let dir = kroma_testing::temp_dir("notices-metadata");

        let result = Metadata::read(&cargo, &dir.path().join("Cargo.toml"), "x86_64-unknown-linux-gnu");

        assert!(matches!(result, Err(Error::Cargo(_))));
    }
}
