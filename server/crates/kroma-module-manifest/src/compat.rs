//! Module <-> server compatibility checks, shared by the supervisor (install /
//! spawn gate) and the store endpoints (catalog "compatible" flag).
//!
//! The RANGE helpers are permissive, mirroring the dependency-range policy in
//! [`crate::Registry`]: an unparseable declaration or version is treated as
//! "no constraint" rather than a mismatch, so a typo'd range degrades to
//! installable instead of bricking the module everywhere. [`engines_satisfied`]
//! is the exception, and deliberately: a requirement this build cannot even
//! name is refused rather than ignored.

use std::collections::BTreeMap;

use crate::{CoreSchema, Storage};

/// The engines this build knows how to check. A module may only require what a
/// server can verify: ignoring an unknown requirement is how a module gets
/// installed onto a host that cannot run it, and then fails somewhere else.
pub const KNOWN_ENGINES: &[&str] = &["core", "host", "server"];

const HOST_ENGINE: &str = "host";
const CORE_ENGINE: &str = "core";

/// Why a module's `engines` map refuses this build.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineRefusal {
    /// The module requires an engine this build cannot check.
    Unknown { engine: String },
    /// The module requires `engine` within `range`, and this build, at
    /// `server_version`, is not.
    Unsatisfied {
        engine: String,
        range: String,
        server_version: String,
    },
    /// The module was built against version `built` of the host interface, and
    /// this build implements `implements`, which does not run it.
    Interface { built: String, implements: String },
    /// The module runs on core schema `needs` and later, and this build's core
    /// schema is `has`.
    CoreSchema { needs: String, has: u32 },
    /// The module reaches `table` as core schema `built` had it, and this build
    /// changed that table at `changed` in a way the module reads wrongly.
    CoreTable {
        table: String,
        built: u32,
        changed: u32,
    },
}

impl std::fmt::Display for EngineRefusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unknown { engine } => write!(
                f,
                "requires an engine this server cannot check: {engine:?} (known: {})",
                KNOWN_ENGINES.join(", "),
            ),
            Self::Unsatisfied {
                engine,
                range,
                server_version,
            } => write!(
                f,
                "requires {engine} {range} (this server is {server_version})"
            ),
            Self::Interface { built, implements } => write!(
                f,
                "was built against module interface {built} (this server implements {implements})"
            ),
            Self::CoreSchema { needs, has } => write!(
                f,
                "requires core schema {needs} (this server's is {has})"
            ),
            Self::CoreTable {
                table,
                built,
                changed,
            } => write!(
                f,
                "reads {table} as core schema {built} had it, and this server changed that table at {changed}: it needs rebuilding"
            ),
        }
    }
}

/// What one build of the server offers a module's `engines`: the version it
/// reports, and the core schema it carries.
#[derive(Debug, Clone, Copy)]
pub struct Provides<'a> {
    pub server: &'a str,
    pub core: &'a CoreSchema,
}

/// A module's `engines` map against what this build provides. `storage` is the
/// module's grant, which `core` is checked against table by table.
///
/// An empty map is no constraint; a server range that will not parse is (like
/// every other range here) treated as no constraint rather than a refusal.
pub fn engines_satisfied(
    engines: &BTreeMap<String, String>,
    storage: Option<&Storage>,
    provides: Provides<'_>,
) -> Result<(), EngineRefusal> {
    for (engine, range) in engines {
        match engine.as_str() {
            HOST_ENGINE => interface_satisfied(range)?,
            CORE_ENGINE => provides.core.runs(range, storage)?,
            _ if !KNOWN_ENGINES.contains(&engine.as_str()) => {
                return Err(EngineRefusal::Unknown {
                    engine: engine.clone(),
                });
            }
            _ if !version_satisfies(Some(range), provides.server) => {
                return Err(EngineRefusal::Unsatisfied {
                    engine: engine.clone(),
                    range: range.clone(),
                    server_version: provides.server.to_owned(),
                });
            }
            _ => {}
        }
    }
    Ok(())
}

/// The interface version a component was `built` against, taken from its
/// manifest or from its own imports, against the one this build implements.
pub fn interface_satisfied(built: &str) -> Result<(), EngineRefusal> {
    if crate::interface_compatible(built, crate::HOST_INTERFACE) {
        return Ok(());
    }
    Err(EngineRefusal::Interface {
        built: built.trim().to_owned(),
        implements: crate::HOST_INTERFACE.to_owned(),
    })
}

/// Whether `version` satisfies a declaration that accepts a bare version
/// (`"0.2.0"`, meaning "at least 0.2.0") or a full dtolnay semver range
/// (`">=0.2, <0.4"`). `None`, blank and `"*"` all mean "anything".
pub fn version_satisfies(decl: Option<&str>, version: &str) -> bool {
    let Some(decl) = decl.map(str::trim).filter(|s| !s.is_empty() && *s != "*") else {
        return true;
    };
    let Ok(server) = semver::Version::parse(version) else {
        return true;
    };
    if let Ok(min) = semver::Version::parse(decl) {
        return server >= min;
    }
    if let Ok(req) = semver::VersionReq::parse(decl) {
        return req.matches(&server);
    }
    true
}

/// Whether `version` satisfies a dependency `range` (dtolnay semver syntax).
/// Blank / `"*"` ranges match anything; unparseable inputs never block.
pub fn range_matches(range: &str, version: &str) -> bool {
    let range = range.trim();
    if range.is_empty() || range == "*" {
        return true;
    }
    match (
        semver::VersionReq::parse(range),
        semver::Version::parse(version),
    ) {
        (Ok(req), Ok(v)) => req.matches(&v),
        _ => true,
    }
}

/// Whether `candidate` is a strictly newer version than `current` (the store's
/// "update available" test). Falls back to plain inequality when either side
/// is not semver, so a registry with odd versions still surfaces changes.
pub fn is_newer(candidate: &str, current: &str) -> bool {
    match (
        semver::Version::parse(candidate.trim()),
        semver::Version::parse(current.trim()),
    ) {
        (Ok(c), Ok(i)) => c > i,
        _ => candidate.trim() != current.trim(),
    }
}

/// The versions older than `latest` a store may offer in its place, newest
/// first. A prerelease is one only when `latest` is itself a prerelease, and a
/// version that is not semver never is, since it cannot be ordered against
/// `latest`.
pub fn fallbacks_newest_first<'a>(
    versions: impl IntoIterator<Item = &'a str>,
    latest: &str,
) -> Vec<&'a str> {
    let Ok(latest) = semver::Version::parse(latest.trim()) else {
        return Vec::new();
    };
    let mut older: Vec<(semver::Version, &str)> = versions
        .into_iter()
        .filter_map(|raw| {
            let version = semver::Version::parse(raw.trim()).ok()?;
            let channel_ok = version.pre.is_empty() || !latest.pre.is_empty();
            (version < latest && channel_ok).then_some((version, raw))
        })
        .collect();
    older.sort_by(|a, b| b.0.cmp(&a.0));
    older.into_iter().map(|(_, raw)| raw).collect()
}

#[cfg(test)]
mod tests;
