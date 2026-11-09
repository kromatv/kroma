//! What an installed module's frontend is, as a client loads it.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use sha2::Digest;

use super::install::validate_id;
use super::Supervisor;

const FRONTEND_DIR: &str = "fe";
const ENTRY: &str = "remoteEntry.js";
const SHARED: &str = "shared.json";
const MAX_SHARED_BYTES: u64 = 64 * 1024;
const REVISION_LEN: usize = 16;

/// An installed module's frontend. `revision` moves whenever any byte under its
/// `fe/` does, so a URL that carries it may be cached for as long as it is
/// served. `shared` is what the entry reads from the host as it loads, as the
/// build wrote it beside the entry; absent when the bundle declares nothing,
/// and the host then hands the entry every shared module.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Frontend {
    pub revision: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shared: Option<BTreeMap<String, Vec<String>>>,
}

#[derive(Default)]
pub(crate) struct FrontendCache {
    generation: u64,
    known: HashMap<String, Frontend>,
}

impl FrontendCache {
    pub(crate) fn new() -> RwLock<Self> {
        RwLock::new(Self::default())
    }

    pub(crate) fn forget(&mut self) {
        self.generation += 1;
        self.known.clear();
    }
}

impl Supervisor {
    /// `id`'s frontend, when its installed bundle carries an entry. Hashed once
    /// per install, then answered from memory until the next install or
    /// uninstall.
    pub fn frontend(&self, id: &str) -> Option<Frontend> {
        validate_id(id).ok()?;
        let dir = self.installed_dir(id).join(FRONTEND_DIR);
        if !dir.join(ENTRY).is_file() {
            return None;
        }
        let generation = {
            let cache = self.frontends.read().unwrap();
            if let Some(known) = cache.known.get(id) {
                return Some(known.clone());
            }
            cache.generation
        };
        let frontend = read_frontend(&dir)?;
        let mut cache = self.frontends.write().unwrap();
        if cache.generation == generation {
            cache.known.insert(id.to_string(), frontend.clone());
        }
        Some(frontend)
    }
}

fn read_frontend(dir: &Path) -> Option<Frontend> {
    let mut files = Vec::new();
    collect_files(dir, PathBuf::new(), &mut files).ok()?;
    files.sort();
    let mut hasher = sha2::Sha256::new();
    for rel in &files {
        let mut file = std::fs::File::open(dir.join(rel)).ok()?;
        let len = file.metadata().ok()?.len();
        hasher.update(rel.to_string_lossy().as_bytes());
        hasher.update([0]);
        hasher.update(len.to_le_bytes());
        std::io::copy(&mut file, &mut hasher).ok()?;
    }
    let mut revision = hex::encode(hasher.finalize());
    revision.truncate(REVISION_LEN);
    Some(Frontend {
        revision,
        shared: read_shared(&dir.join(SHARED)),
    })
}

fn collect_files(root: &Path, rel: PathBuf, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(root.join(&rel))? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let path = rel.join(entry.file_name());
        if kind.is_dir() {
            collect_files(root, path, out)?;
        } else if kind.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

fn read_shared(path: &Path) -> Option<BTreeMap<String, Vec<String>>> {
    let len = std::fs::metadata(path).ok()?.len();
    if len > MAX_SHARED_BYTES {
        return None;
    }
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}
