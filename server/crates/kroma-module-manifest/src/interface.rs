//! The host interface a component is built against, and whether this build
//! implements it.

/// The version of the `kroma:module` interface this build implements. A
/// component imports it by this number, and a manifest names it as
/// `engines.host`.
pub const HOST_INTERFACE: &str = "0.2.0";

/// Whether a component built against version `built` of the interface runs on
/// a host that implements `host`.
///
/// Two versions run together when semver calls them compatible, the rule the
/// component linker applies to a versioned import: the same major, the same
/// minor below 1.0, and the very same version below 0.1. A version that is not
/// semver cannot be linked and is never compatible.
pub fn interface_compatible(built: &str, host: &str) -> bool {
    match (track(built), track(host)) {
        (Some(built), Some(host)) => built == host,
        _ => false,
    }
}

fn track(version: &str) -> Option<(u64, u64, u64)> {
    let version = semver::Version::parse(version.trim()).ok()?;
    if !version.pre.is_empty() {
        return None;
    }
    Some(match (version.major, version.minor) {
        (0, 0) => (0, 0, version.patch),
        (0, minor) => (0, minor, 0),
        (major, _) => (major, 0, 0),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_patch_apart_runs_and_a_minor_apart_below_one_does_not() {
        assert!(interface_compatible("0.2.0", "0.2.0"));
        assert!(interface_compatible("0.2.1", "0.2.0"));
        assert!(interface_compatible("0.2.0", "0.2.7"));
        assert!(!interface_compatible("0.3.0", "0.2.0"));
        assert!(!interface_compatible("0.1.9", "0.2.0"));
    }

    #[test]
    fn from_one_point_zero_the_major_decides() {
        assert!(interface_compatible("1.4.0", "1.0.2"));
        assert!(!interface_compatible("2.0.0", "1.9.9"));
        assert!(!interface_compatible("1.0.0", "0.9.0"));
    }

    #[test]
    fn below_zero_point_one_only_the_same_version_runs() {
        assert!(interface_compatible("0.0.3", "0.0.3"));
        assert!(!interface_compatible("0.0.3", "0.0.4"));
    }

    #[test]
    fn a_version_that_cannot_be_ordered_is_never_compatible() {
        assert!(!interface_compatible("", "0.2.0"));
        assert!(!interface_compatible("latest", "0.2.0"));
        assert!(!interface_compatible("0.2", "0.2.0"));
        assert!(!interface_compatible("0.2.0-rc.1", "0.2.0"));
    }

    #[test]
    fn this_build_implements_the_interface_the_wit_package_names() {
        let wit = include_str!("../../kroma-module-runtime/wit/module.wit");

        let package = wit.lines().next().unwrap();

        assert_eq!(package, format!("package kroma:module@{HOST_INTERFACE};"));
        assert!(interface_compatible(HOST_INTERFACE, HOST_INTERFACE));
    }
}
