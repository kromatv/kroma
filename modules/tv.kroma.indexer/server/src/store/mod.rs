//! Fetches the community-maintained Cardigann definition set at runtime and
//! caches it under the data directory. The definitions are GPL and
//! not vendored: the server downloads them on demand.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context as _, Result};
use serde::{Deserialize, Serialize};

use crate::definition::{self, Definition};

mod heal;
mod lock;
mod status;
mod sync;
#[cfg(test)]
mod test_support;
mod unpack;

pub use status::SyncRecord;

// The `master` tarball, in one request instead of ~600 per-file fetches.
// Overridable so a deployment can pin a fork/mirror.
pub const DEFAULT_SOURCE: &str =
    "https://codeload.github.com/Prowlarr/Indexers/tar.gz/refs/heads/master";

/// A lightweight view of a definition for the admin's browse list (parsed
/// without the full search/login schema).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefinitionMeta {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub links: Vec<String>,
    #[serde(default)]
    pub language: String,
}

/// Outcome of a sync, for the admin toast.
#[derive(Debug, Clone, Serialize)]
pub struct SyncReport {
    pub count: usize,
    pub version: String,
}

pub struct DefinitionStore {
    dir: PathBuf,
    source: String,
    route: Result<Option<String>, String>,
}

impl DefinitionStore {
    /// Cache lives at `<data_dir>/indexer-defs`.
    pub fn new(data_dir: &Path) -> Self {
        DefinitionStore {
            dir: data_dir.join("indexer-defs"),
            source: DEFAULT_SOURCE.to_string(),
            route: Ok(None),
        }
    }

    pub fn source(&self) -> &str {
        &self.source
    }

    /// Sync through the route's proxy, or refuse to sync when it is an error.
    pub fn routed(mut self, route: anyhow::Result<Option<String>>) -> Self {
        self.route = route.map_err(|e| e.to_string());
        self
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn is_populated(&self) -> bool {
        std::fs::read_dir(&self.dir)
            .map(|mut d| d.any(|e| e.as_ref().map(is_yml).unwrap_or(false)))
            .unwrap_or(false)
    }

    /// List cached definitions (lightweight metadata), sorted by name.
    pub fn list(&self) -> Result<Vec<DefinitionMeta>> {
        let mut out = Vec::new();
        let rd = match std::fs::read_dir(&self.dir) {
            Ok(rd) => rd,
            Err(_) => return Ok(out), // not synced yet
        };
        for entry in rd {
            let entry = entry?;
            if !is_yml(&entry) {
                continue;
            }
            if let Ok(bytes) = std::fs::read(entry.path()) {
                if let Ok(mut meta) = serde_yaml::from_slice::<DefinitionMeta>(&bytes) {
                    // Key on the file stem, not the internal `id`: a definition's
                    // internal id can differ from its filename (`darkpeers-api.yml`
                    // -> `id: darkpeers`), and the stem is what `load` resolves.
                    if let Some(stem) = entry
                        .path()
                        .file_stem()
                        .map(|s| s.to_string_lossy().into_owned())
                    {
                        meta.id = stem;
                        out.push(meta);
                    }
                }
            }
        }
        out.sort_by_key(|a| a.name.to_lowercase());
        Ok(out)
    }

    /// Load and fully parse one definition by id. The id reaches this from an
    /// admin request body, so it is checked against the cache-file vocabulary
    /// before it is joined onto a path.
    ///
    /// A definition the cache has lost is fetched by one sync of the whole set,
    /// which every caller racing on it shares, across this module's instances, and
    /// which no id retries more than once every 15 minutes. Blocking, and for that
    /// sync's duration.
    pub fn load(&self, id: &str) -> Result<Definition> {
        let path = self.path_for(id)?;
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => self.heal(id, &path)?,
            Err(e) => return Err(e).with_context(|| format!("read definition '{id}'")),
        };
        definition::parse(&bytes).with_context(|| format!("parse definition '{id}'"))
    }

    fn path_for(&self, id: &str) -> Result<PathBuf> {
        if !is_definition_id(id) {
            bail!("'{id}' is not a definition id");
        }
        Ok(self.dir.join(format!("{id}.yml")))
    }
}

fn is_definition_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && !id.starts_with('.')
        && !id.contains("..")
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

pub(super) fn is_yml(entry: &std::fs::DirEntry) -> bool {
    entry
        .path()
        .extension()
        .is_some_and(|e| e == "yml" || e == "yaml")
}

#[cfg(test)]
mod tests;
