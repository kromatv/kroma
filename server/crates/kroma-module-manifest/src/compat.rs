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

/// The engines this build knows how to check. A module may only require what a
/// server can verify: ignoring an unknown requirement is how a module gets
/// installed onto a host that cannot run it, and then fails somewhere else.
pub const KNOWN_ENGINES: &[&str] = &["server"];

/// A module's `engines` map against what this build provides.
///
/// `Err` carries the reason, phrased for an operator. An empty map is no
/// constraint; a range that will not parse is (like every other range here)
/// treated as no constraint rather than a refusal.
pub fn engines_satisfied(
    engines: &BTreeMap<String, String>,
    server_version: &str,
) -> Result<(), String> {
    for (engine, range) in engines {
        if !KNOWN_ENGINES.contains(&engine.as_str()) {
            return Err(format!(
                "requires an engine this server cannot check: {engine:?} (known: {})",
                KNOWN_ENGINES.join(", "),
            ));
        }
        if !version_satisfies(Some(range), server_version) {
            return Err(format!(
                "requires {engine} {range} (this server is {server_version})",
            ));
        }
    }
    Ok(())
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
    match (semver::VersionReq::parse(range), semver::Version::parse(version)) {
        (Ok(req), Ok(v)) => req.matches(&v),
        _ => true,
    }
}

/// Whether `candidate` is a strictly newer version than `current` (the store's
/// "update available" test). Falls back to plain inequality when either side
/// is not semver, so a registry with odd versions still surfaces changes.
pub fn is_newer(candidate: &str, current: &str) -> bool {
    match (semver::Version::parse(candidate.trim()), semver::Version::parse(current.trim())) {
        (Ok(c), Ok(i)) => c > i,
        _ => candidate.trim() != current.trim(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engines(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs.iter().map(|(k, v)| ((*k).to_string(), (*v).to_string())).collect()
    }

    #[test]
    fn an_engine_range_is_checked_against_this_server() {
        assert!(engines_satisfied(&engines(&[("server", ">=0.1.4")]), "0.2.0").is_ok());
        assert!(engines_satisfied(&engines(&[]), "0.1.0").is_ok());

        let err = engines_satisfied(&engines(&[("server", ">=0.9")]), "0.2.0").unwrap_err();
        assert!(err.contains("requires server >=0.9"), "{err}");
        assert!(err.contains("this server is 0.2.0"), "{err}");
    }

    #[test]
    fn an_engine_this_build_cannot_check_is_refused_rather_than_ignored() {
        // Ignoring it is how a module lands on a host that cannot run it and
        // then fails somewhere with no trace back to the requirement.
        let err = engines_satisfied(&engines(&[("ffmpeg", ">=6")]), "0.2.0").unwrap_err();
        assert!(err.contains("cannot check"), "{err}");
        assert!(err.contains("ffmpeg"), "{err}");
        assert!(err.contains("known: server"), "{err}");
    }

    #[test]
    fn is_newer_compares_semver_then_falls_back() {
        assert!(is_newer("0.2.0", "0.1.9"));
        assert!(!is_newer("0.1.9", "0.2.0"));
        assert!(!is_newer("0.2.0", "0.2.0"));
        assert!(is_newer("nightly-2", "nightly-1"));
    }

    #[test]
    fn bare_min_server_means_at_least() {
        assert!(version_satisfies(Some("0.1.4"), "0.1.4"));
        assert!(version_satisfies(Some("0.1.4"), "0.2.0"));
        assert!(!version_satisfies(Some("0.2.0"), "0.1.4"));
    }

    #[test]
    fn ranges_and_wildcards_work() {
        assert!(version_satisfies(Some(">=0.1, <0.3"), "0.2.9"));
        assert!(!version_satisfies(Some(">=0.3"), "0.2.9"));
        assert!(version_satisfies(Some("*"), "0.0.1"));
        assert!(version_satisfies(Some("  "), "0.0.1"));
        assert!(version_satisfies(None, "0.0.1"));
    }

    #[test]
    fn unparseable_declarations_never_block() {
        assert!(version_satisfies(Some("not-a-version"), "0.1.4"));
        assert!(version_satisfies(Some("1.0.0"), "not-a-version"));
        assert!(range_matches("garbage", "0.1.0"));
    }

    #[test]
    fn dependency_ranges() {
        assert!(range_matches("^0.1.0", "0.1.9"));
        assert!(!range_matches("^0.1.0", "0.2.0"));
        assert!(range_matches("*", "9.9.9"));
    }
}
