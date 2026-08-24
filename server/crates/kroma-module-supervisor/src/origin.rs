//! Where an installed module came from, recorded beside it at install time so
//! the admin can tell an artifact apart from a locally built binary.

use std::path::Path;

use super::{Supervisor, MODULE_BIN};

/// Written beside a module at install time; not part of the `.kmod` itself.
const ORIGIN_FILE: &str = "origin.json";

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
    /// The binary's size and mtime AS INSTALLED. Compared against what is on
    /// disk to spot a local build; recorded rather than inferred from
    /// `installed_at` so restoring a backup (which rewrites mtimes wholesale)
    /// does not read as one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bin: Option<BinStamp>,
    /// The binary on disk is not the one installed: a dev loop swapped it, so
    /// this module is NOT running the artifact it was installed from.
    #[serde(default)]
    pub local_build: bool,
}

/// Identity of an installed binary, enough to notice it was replaced.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinStamp {
    pub size: u64,
    /// Unix seconds.
    pub mtime: u64,
}

impl Origin {
    fn unknown() -> Self {
        Self {
            kind: "unknown".into(),
            url: None,
            installed_at: 0,
            bin: None,
            local_build: false,
        }
    }
}

fn unix_secs(t: std::time::SystemTime) -> u64 {
    t.duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn stamp_of(path: &Path) -> Option<BinStamp> {
    let meta = std::fs::metadata(path).ok()?;
    Some(BinStamp {
        size: meta.len(),
        mtime: meta.modified().map(unix_secs).unwrap_or(0),
    })
}

impl Supervisor {
    /// Where an installed module came from, and whether its binary has been
    /// swapped since. Read from the `origin.json` written at install time;
    /// modules installed before that existed report `Origin::unknown()`.
    pub fn origin(&self, id: &str) -> Origin {
        let dir = self.dir(id);
        let mut origin = std::fs::read_to_string(dir.join(ORIGIN_FILE))
            .ok()
            .and_then(|s| serde_json::from_str::<Origin>(&s).ok())
            .unwrap_or_else(Origin::unknown);
        // A binary that is not the one recorded at install is one a dev loop
        // swapped in, so the process is not running the artifact this module was
        // installed from.
        if let (Some(installed), Some(current)) =
            (origin.bin.clone(), stamp_of(&dir.join(MODULE_BIN)))
        {
            origin.local_build = current != installed;
        }
        origin
    }

    pub(crate) fn write_origin(&self, id: &str, kind: &str, url: Option<&str>) {
        let origin = Origin {
            kind: kind.to_string(),
            url: url.map(str::to_string),
            installed_at: unix_secs(std::time::SystemTime::now()),
            bin: stamp_of(&self.dir(id).join(MODULE_BIN)),
            local_build: false,
        };
        if let Ok(body) = serde_json::to_string(&origin) {
            let _ = std::fs::write(self.dir(id).join(ORIGIN_FILE), body);
        }
    }
}
