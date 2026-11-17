use super::*;

fn engines(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
        .collect()
}

const NO_CORE: &CoreSchema = &CoreSchema {
    version: 0,
    tables: BTreeMap::new(),
};

fn on(server: &str) -> Provides<'_> {
    Provides {
        server,
        core: NO_CORE,
    }
}

fn reaching(tables: &[&str]) -> Storage {
    Storage {
        core: crate::CoreScope {
            read: tables.iter().map(|t| (*t).to_string()).collect(),
            write: Vec::new(),
        },
        adopt: Vec::new(),
    }
}

#[test]
fn an_engine_range_is_checked_against_this_server() {
    assert!(engines_satisfied(&engines(&[("server", ">=0.1.4")]), None, on("0.2.0")).is_ok());
    assert!(engines_satisfied(&engines(&[]), None, on("0.1.0")).is_ok());

    let err = engines_satisfied(&engines(&[("server", ">=0.9")]), None, on("0.2.0")).unwrap_err();
    assert_eq!(
        err,
        EngineRefusal::Unsatisfied {
            engine: "server".into(),
            range: ">=0.9".into(),
            server_version: "0.2.0".into(),
        }
    );
    assert_eq!(
        err.to_string(),
        "requires server >=0.9 (this server is 0.2.0)"
    );
}

#[test]
fn an_engine_this_build_cannot_check_is_refused_rather_than_ignored() {
    let err = engines_satisfied(&engines(&[("ffmpeg", ">=6")]), None, on("0.2.0"))
        .unwrap_err()
        .to_string();
    assert!(err.contains("cannot check"), "{err}");
    assert!(err.contains("ffmpeg"), "{err}");
    assert!(err.contains("known: core, host, server"), "{err}");
}

#[test]
fn a_module_built_against_another_interface_is_refused_by_name() {
    let met = engines(&[("host", crate::HOST_INTERFACE), ("server", ">=0.1.4")]);
    let other = engines(&[("host", "9.0.0"), ("server", ">=0.1.4")]);

    let refusal = engines_satisfied(&other, None, on("0.2.0")).unwrap_err();

    assert!(engines_satisfied(&met, None, on("0.2.0")).is_ok());
    assert_eq!(
        refusal,
        EngineRefusal::Interface {
            built: "9.0.0".into(),
            implements: crate::HOST_INTERFACE.into(),
        }
    );
    assert_eq!(
        refusal.to_string(),
        format!(
            "was built against module interface 9.0.0 (this server implements {})",
            crate::HOST_INTERFACE
        )
    );
}

#[test]
fn fallbacks_are_the_older_versions_newest_first() {
    let versions = ["0.4.29", "0.4.31", "0.4.9", "0.4.30"];

    let fallbacks = fallbacks_newest_first(versions, "0.4.31");

    assert_eq!(fallbacks, ["0.4.30", "0.4.29", "0.4.9"]);
}

#[test]
fn a_prerelease_is_no_fallback_for_a_stable_version() {
    let versions = ["1.1.0-beta.2", "1.0.0"];

    let fallbacks = fallbacks_newest_first(versions, "1.1.0");

    assert_eq!(fallbacks, ["1.0.0"]);
}

#[test]
fn a_prerelease_newest_version_may_fall_back_to_an_older_prerelease() {
    let versions = ["2.0.0-rc.1", "2.0.0-rc.2", "1.9.0"];

    let fallbacks = fallbacks_newest_first(versions, "2.0.0-rc.3");

    assert_eq!(fallbacks, ["2.0.0-rc.2", "2.0.0-rc.1", "1.9.0"]);
}

#[test]
fn a_version_that_is_not_semver_is_never_a_fallback() {
    let fallbacks = fallbacks_newest_first(["nightly", "0.1.0"], "0.2.0");

    assert_eq!(fallbacks, ["0.1.0"]);
}

#[test]
fn nothing_falls_back_from_a_newest_version_that_is_not_semver() {
    assert!(fallbacks_newest_first(["0.1.0"], "nightly").is_empty());
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

#[test]
fn the_core_engine_is_checked_against_the_core_schema_this_build_carries() {
    let core = CoreSchema {
        version: 19,
        ..CoreSchema::default()
    };
    let provides = Provides {
        server: "0.2.0",
        core: &core,
    };
    let grant = reaching(&["downloads"]);

    let refusal = engines_satisfied(&engines(&[("core", "20")]), Some(&grant), provides);

    assert_eq!(
        refusal,
        Err(EngineRefusal::CoreSchema {
            needs: "20".into(),
            has: 19,
        })
    );
}
