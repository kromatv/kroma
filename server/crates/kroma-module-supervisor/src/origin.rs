//! Where an installed module came from, recorded beside it at install time so
//! the admin can tell an artifact apart from a locally built component.

use std::path::Path;

use kroma_module_manifest::Permissions;
use sha2::Digest;

use super::{Supervisor, MODULE_COMPONENT};

/// Written beside a module at install time; not part of the `.kmod` itself.
pub(crate) const ORIGIN_FILE: &str = "origin.json";

/// Where an installed module came from.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Origin {
    /// `registry` | `upload` | `url` | `unknown`.
    pub kind: String,
    /// The catalog or artifact URL, when it came from one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Unix seconds.
    pub installed_at: u64,
    /// The component's size and mtime AS INSTALLED. Compared against what is on
    /// disk to spot a local build; recorded rather than inferred from
    /// `installed_at` so restoring a backup (which rewrites mtimes wholesale)
    /// does not read as one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bin: Option<BinStamp>,
    /// The component on disk is not the one installed: a dev loop swapped it, so
    /// this module is NOT running the artifact it was installed from.
    #[serde(default)]
    pub local_build: bool,
    /// Came from the official catalog. Recorded here at install time because
    /// `url` is the artifact's address, which names a release host rather than
    /// the catalog that listed it. Absent in a record written before this
    /// existed, which reads as "not known to be official".
    #[serde(default)]
    pub official: bool,
    /// The sha256 of the component the host installed, which it must match to
    /// start.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub component_sha256: Option<String>,
}

/// Where a module being installed came from, as the caller knows it.
#[derive(Debug, Clone, Copy)]
pub struct Source<'a> {
    /// `registry` | `upload` | `url`.
    pub kind: &'a str,
    /// The artifact's address, when there was one.
    pub url: Option<&'a str>,
    /// The catalog that listed it was the official one.
    pub official: bool,
    /// What the bundle's `permissions` may be, for this install to go through.
    pub accept: Accept<'a>,
}

/// What an operator accepted, which a bundle's `permissions` are held to.
#[derive(Debug, Clone, Copy)]
pub enum Accept<'a> {
    /// They read the bundle's own declaration, or it comes from no catalog.
    Anything,
    /// They read this declaration on its catalog row, so the bundle must say the
    /// same.
    Exactly(&'a Permissions),
    /// Nobody is looking, so the bundle may ask for no more than what is
    /// installed: no wider `permissions`, no key in `settings.write` the installed
    /// version did not declare, and the same `permissions` as its catalog row when
    /// it has one. Refused with [`AsksForMore`].
    NoWider(Option<&'a Permissions>),
}

/// An install nobody is looking at, refused because the bundle asks for more
/// than the installed version was granted. Only the install plan takes it.
#[derive(Debug)]
pub struct AsksForMore {
    pub id: String,
}

impl std::fmt::Display for AsksForMore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "'{}' asks for more than the installed version; accept it from the install plan",
            self.id
        )
    }
}

impl std::error::Error for AsksForMore {}

/// Identity of an installed component, enough to notice it was replaced.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinStamp {
    pub size: u64,
    /// Unix seconds.
    pub mtime: u64,
}

impl Origin {
    pub(crate) fn unknown() -> Self {
        Self {
            kind: "unknown".into(),
            url: None,
            installed_at: 0,
            bin: None,
            local_build: false,
            official: false,
            component_sha256: None,
        }
    }
}

fn unix_secs(t: std::time::SystemTime) -> u64 {
    t.duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(sha2::Sha256::digest(bytes))
}

fn stamp_of(path: &Path) -> Option<BinStamp> {
    let meta = std::fs::metadata(path).ok()?;
    Some(BinStamp {
        size: meta.len(),
        mtime: meta.modified().map(unix_secs).unwrap_or(0),
    })
}

impl Supervisor {
    /// Where an installed module came from, and whether its component has been
    /// swapped since. Read from the `origin.json` written at install time;
    /// modules installed before that existed report `Origin::unknown()`.
    pub fn origin(&self, id: &str) -> Origin {
        let dir = self.installed_dir(id);
        let mut origin = read_origin(&dir).unwrap_or_else(Origin::unknown);
        // A component that is not the one recorded at install is one a dev loop
        // swapped in, so the module is not running the artifact it was installed
        // from.
        if let (Some(installed), Some(current)) =
            (origin.bin.clone(), stamp_of(&dir.join(MODULE_COMPONENT)))
        {
            origin.local_build = current != installed;
        }
        origin
    }

    pub(crate) fn write_origin(&self, id: &str, source: Source<'_>) -> std::io::Result<()> {
        let dir = self.installed_dir(id);
        let component = dir.join(MODULE_COMPONENT);
        let origin = Origin {
            kind: source.kind.to_string(),
            url: source.url.map(str::to_string),
            installed_at: unix_secs(std::time::SystemTime::now()),
            bin: stamp_of(&component),
            local_build: false,
            official: source.official,
            component_sha256: std::fs::read(&component).ok().map(|wasm| sha256_hex(&wasm)),
        };
        write_origin_to(&dir, &origin)
    }

    /// `id`'s component, as long as it is the one the host installed: its sha256
    /// must be the one recorded at install.
    pub(crate) fn verified_component(&self, id: &str) -> anyhow::Result<(Vec<u8>, String)> {
        let dir = self.installed_dir(id);
        let wasm = std::fs::read(dir.join(MODULE_COMPONENT))
            .map_err(|error| anyhow::anyhow!("read '{id}'s component: {error}"))?;
        let actual = sha256_hex(&wasm);
        match read_origin(&dir).and_then(|origin| origin.component_sha256) {
            Some(recorded) if recorded == actual => Ok((wasm, actual)),
            Some(_) => anyhow::bail!(
                "'{id}'s component does not match the sha256 recorded when it was installed, so it was not \
                 started; install it again"
            ),
            None => anyhow::bail!(
                "'{id}' has no sha256 recorded for its component, so it was not started; install it again"
            ),
        }
    }

    pub(crate) fn accept_local_build(&self, id: &str) -> std::io::Result<()> {
        let dir = self.installed_dir(id);
        let wasm = std::fs::read(dir.join(MODULE_COMPONENT))?;
        let mut origin = read_origin(&dir).unwrap_or_else(Origin::unknown);
        origin.component_sha256 = Some(sha256_hex(&wasm));
        write_origin_to(&dir, &origin)
    }
}

pub(crate) fn read_origin(dir: &Path) -> Option<Origin> {
    let text = std::fs::read_to_string(dir.join(ORIGIN_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

pub(crate) fn write_origin_to(dir: &Path, origin: &Origin) -> std::io::Result<()> {
    let body = serde_json::to_string(origin).map_err(std::io::Error::other)?;
    std::fs::write(dir.join(ORIGIN_FILE), body)
}
