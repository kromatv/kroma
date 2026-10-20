use serde::{Deserialize, Serialize};

use super::Channel;

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

/// The newest build a channel offers: its version, the CI build number when
/// the feed carries one, and where to read about it.
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
    triplet(&version)?;
    Some(Latest {
        version,
        build: None,
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
        .max_by_key(|latest| latest.build)
}

fn server_package(name: &str) -> Option<(String, u64)> {
    let rest = name.strip_prefix("kroma-")?;
    let stem = rest.strip_suffix(".spk")?;
    let (versioned, _arch) = stem.rsplit_once('-')?;
    let (version, build) = versioned.rsplit_once('.')?;
    triplet(version)?;
    Some((version.to_owned(), build.parse().ok()?))
}

fn triplet(version: &str) -> Option<(u64, u64, u64)> {
    let base = version.split(['-', '+']).next()?;
    let mut parts = base.split('.').map(|p| p.parse::<u64>().ok());
    let found = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(found)
}

/// Whether `latest` is newer than the running `version` built as `build`: by
/// version on the stable channel, by build number on the canary one, where
/// every build shares the version it is heading for. A local build (number 0)
/// is never behind a canary.
pub fn is_newer(channel: Channel, latest: &Latest, version: &str, build: u64) -> bool {
    match channel {
        Channel::Stable => match (triplet(&latest.version), triplet(version)) {
            (Some(theirs), Some(ours)) => theirs > ours,
            _ => false,
        },
        Channel::Canary => build > 0 && latest.build.is_some_and(|theirs| theirs > build),
    }
}
