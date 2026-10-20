use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub(super) struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<Asset>,
}

#[derive(Debug, Deserialize)]
struct Asset {
    name: String,
    #[serde(default)]
    created_at: Option<String>,
}

/// The newest build a channel offers: its version, the CI build number its
/// server package carries, and where to read about it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Latest {
    pub version: String,
    pub build: Option<u64>,
    pub url: String,
    pub published_at: Option<String>,
}

pub(super) fn stable(release: Release) -> Option<Latest> {
    let version = release.tag_name.strip_prefix('v')?.to_owned();
    semver::Version::parse(&version).ok()?;
    let build = release
        .assets
        .iter()
        .filter_map(|asset| server_package(&asset.name))
        .filter(|(packaged, _)| *packaged == version)
        .map(|(_, build)| build)
        .max();
    Some(Latest {
        version,
        build,
        url: release.html_url,
        published_at: release.published_at,
    })
}

pub(super) fn canary(release: Release) -> Option<Latest> {
    let url = release.html_url;
    release
        .assets
        .into_iter()
        .filter_map(|asset| {
            let (version, build) = server_package(&asset.name)?;
            Some(Latest {
                version,
                build: Some(build),
                url: url.clone(),
                published_at: asset.created_at,
            })
        })
        .max_by(|a, b| order(a, &b.version, b.build.unwrap_or(0)))
}

fn server_package(name: &str) -> Option<(String, u64)> {
    let stem = name.strip_prefix("kroma-")?.strip_suffix(".spk")?;
    let (versioned, _arch) = stem.rsplit_once('-')?;
    let (version, build) = versioned.rsplit_once('.')?;
    semver::Version::parse(version).ok()?;
    Some((version.to_owned(), build.parse().ok()?))
}

fn order(latest: &Latest, version: &str, build: u64) -> Ordering {
    let (Ok(theirs), Ok(ours)) = (
        semver::Version::parse(&latest.version),
        semver::Version::parse(version),
    ) else {
        return Ordering::Equal;
    };
    theirs.cmp(&ours).then_with(|| match latest.build {
        Some(theirs) if build > 0 => theirs.cmp(&build),
        _ => Ordering::Equal,
    })
}

/// Whether `latest` is newer than the running `version` built as `build`:
/// by version first, then, for the same version, by CI build number, so an
/// earlier build of a version hears that a later one shipped. A local build
/// (number 0) is only ever behind a higher version.
pub fn is_newer(latest: &Latest, version: &str, build: u64) -> bool {
    order(latest, version, build) == Ordering::Greater
}
