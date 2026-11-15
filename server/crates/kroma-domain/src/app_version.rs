//! Which app a request comes from, and whether this server still serves it.

use serde::{Deserialize, Serialize};

/// The oldest app version this server serves. One number for every shell.
///
/// It moves only in a change that breaks an app contract, and that change's
/// release notes say so. Raising it strands every television that has not
/// updated, so it never moves for convenience.
pub const MIN_CLIENT: &str = "0.1.39";

/// The header an app names itself in, as `<shell>/<version>`.
pub const APP_VERSION_HEADER: &str = "x-kroma-client";

const MAX_SHELL: usize = 32;
const MAX_VERSION: usize = 64;

/// One app build, as the `X-Kroma-Client` header names it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersion {
    pub shell: String,
    pub version: String,
}

impl AppVersion {
    /// Reads `<shell>/<version>`. Anything else is no version at all, which the
    /// server treats as unknown, never as too old.
    pub fn parse(header: &str) -> Option<Self> {
        let (shell, version) = header.trim().split_once('/')?;
        let shell_ok = (1..=MAX_SHELL).contains(&shell.len())
            && shell.starts_with(|c: char| c.is_ascii_lowercase())
            && shell
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
        let version_ok = (1..=MAX_VERSION).contains(&version.len())
            && version
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'));
        (shell_ok && version_ok).then(|| Self {
            shell: shell.to_string(),
            version: version.to_string(),
        })
    }

    /// The header value this build sends.
    pub fn header(&self) -> String {
        format!("{}/{}", self.shell, self.version)
    }

    /// Whether this build is older than [`MIN_CLIENT`].
    pub fn outdated(&self) -> bool {
        below(&self.version, MIN_CLIENT)
    }
}

/// Whether `version` is older than `floor`. Only the leading numbers count: a
/// canary is a build of the release it leads to, so `0.1.39-canary.4` is 0.1.39,
/// and a version with no number in it cannot be ordered and is never below.
pub fn below(version: &str, floor: &str) -> bool {
    let (Some(version), Some(floor)) = (release_core(version), release_core(floor)) else {
        return false;
    };
    let width = version.len().max(floor.len());
    let padded = |numbers: &[u64]| -> Vec<u64> {
        let mut out = numbers.to_vec();
        out.resize(width, 0);
        out
    };
    padded(&version) < padded(&floor)
}

fn release_core(raw: &str) -> Option<Vec<u64>> {
    let numbers: Vec<u64> = raw
        .trim()
        .split(['-', '+'])
        .next()?
        .split('.')
        .map(|part| part.parse().ok())
        .collect::<Option<_>>()?;
    (!numbers.is_empty()).then_some(numbers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_shell_and_the_version_out_of_the_header() {
        let app = AppVersion::parse("webos/0.1.39").unwrap();

        assert_eq!(app.shell, "webos");
        assert_eq!(app.version, "0.1.39");
        assert_eq!(app.header(), "webos/0.1.39");
    }

    #[test]
    fn refuses_a_header_that_is_not_a_shell_and_a_version() {
        for header in [
            "",
            "web",
            "/0.1.39",
            "web/",
            "Web/0.1.39",
            "web/0.1.39 (x)",
            "web/0.1.39/extra",
            "a b/1",
        ] {
            assert_eq!(AppVersion::parse(header), None, "{header:?}");
        }
    }

    #[test]
    fn a_canary_compares_as_the_release_it_leads_to() {
        assert!(!below("0.1.39-canary.4", "0.1.39"));
        assert!(below("0.1.38-canary.9", "0.1.39"));
        assert!(!below("0.1.39+build.7", "0.1.39"));
    }

    #[test]
    fn orders_by_number_and_pads_a_short_version_with_zeros() {
        assert!(below("0.1.9", "0.1.10"));
        assert!(!below("0.2", "0.1.99"));
        assert!(!below("0.1.39", "0.1.39.0"));
        assert!(below("0.1.39", "0.1.39.1"));
    }

    #[test]
    fn a_version_that_is_not_a_number_is_never_below_the_floor() {
        assert!(!below("dev", "0.1.39"));
        assert!(!below("0.1.39", "dev"));
        assert!(!below("", "0.1.39"));
    }

    #[test]
    fn the_floor_is_a_release_version() {
        assert!(release_core(MIN_CLIENT).is_some());
    }
}
