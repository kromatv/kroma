//! Fetches the community-maintained Cardigann definition set at runtime and
//! caches it under the data directory. Not vendored: the definitions are GPL
//! and KROMA is MIT, so the server downloads them on demand instead.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context as _, Result};
use serde::{Deserialize, Serialize};

use crate::definition::{self, Definition};

mod sync;
#[cfg(test)]
mod test_support;

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
}

impl DefinitionStore {
    /// Cache lives at `<data_dir>/indexer-defs`.
    pub fn new(data_dir: &Path) -> Self {
        DefinitionStore { dir: data_dir.join("indexer-defs"), source: DEFAULT_SOURCE.to_string() }
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
                    if let Some(stem) = entry.path().file_stem().map(|s| s.to_string_lossy().into_owned()) {
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
    pub fn load(&self, id: &str) -> Result<Definition> {
        let path = self.path_for(id)?;
        let bytes = std::fs::read(&path)
            .with_context(|| format!("definition '{id}' not found (run a definitions sync?)"))?;
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
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

pub(super) fn is_yml(entry: &std::fs::DirEntry) -> bool {
    entry.path().extension().is_some_and(|e| e == "yml" || e == "yaml")
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::test_support::{scratch, store_for, tmpdir, valid_definition, DEMO_YML};

    // A fresh install has never synced, so the cache directory does not exist at
    // all. Reading it has to come back EMPTY rather than as an error: the module
    // lists its definitions on the settings screen before anyone has pressed
    // sync, and an error there reads as a broken module rather than a new one.
    #[test]
    fn a_store_that_has_never_synced_is_empty_rather_than_broken() {
        let dir = kroma_testing::temp_dir("defs-empty");
        let store = DefinitionStore::new(dir.path());
        assert!(!store.is_populated());
        assert!(store.list().expect("listing a store that never synced").is_empty());
        // Asking for one by name is still an error: nothing is there to load.
        assert!(store.load("thepiratebay").is_err());
    }


    #[test]
    fn meta_parses_minimal_yaml() {
        let yaml = br#"
id: example
name: Example Tracker
type: public
description: "A test"
links:
  - https://example.org/
"#;
        let meta: DefinitionMeta = serde_yaml::from_slice(yaml).unwrap();
        assert_eq!(meta.id, "example");
        assert_eq!(meta.kind, "public");
        assert_eq!(meta.links, vec!["https://example.org/"]);
    }

    #[test]
    fn dir_is_under_the_data_dir() {
        let data = tmpdir("dir");
        let store = DefinitionStore::new(data.path());
        assert_eq!(store.dir(), data.path().join("indexer-defs"));
    }

    #[test]
    fn is_populated_reflects_presence_of_yaml_files() {
        let data = tmpdir("pop");
        let store = DefinitionStore::new(data.path());
        assert!(!store.is_populated());

        std::fs::create_dir_all(store.dir()).unwrap();
        assert!(!store.is_populated());
        std::fs::write(store.dir().join("readme.txt"), b"hi").unwrap();
        assert!(!store.is_populated());
        std::fs::write(store.dir().join("t.yml"), b"name: T").unwrap();
        assert!(store.is_populated());
    }

    #[test]
    fn list_returns_empty_when_unsynced() {
        let data = tmpdir("unsynced");
        let store = DefinitionStore::new(data.path());
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn list_sorts_by_name_keys_on_stem_and_skips_non_yaml() {
        let data = tmpdir("list");
        let store = DefinitionStore::new(data.path());
        std::fs::create_dir_all(store.dir()).unwrap();
        std::fs::write(store.dir().join("zebra.yml"), b"id: zebra\nname: Zebra").unwrap();
        std::fs::write(store.dir().join("apple.yml"), b"id: apple\nname: apple").unwrap();
        // Internal id differs from the file stem: the stem must win.
        std::fs::write(store.dir().join("darkpeers-api.yml"), b"id: darkpeers\nname: Dark").unwrap();
        std::fs::write(store.dir().join("notes.txt"), b"skip me").unwrap();

        let metas = store.list().unwrap();
        assert_eq!(metas.len(), 3);
        // Case-insensitive name sort: apple, Dark, Zebra.
        assert_eq!(metas[0].name, "apple");
        assert_eq!(metas[1].name, "Dark");
        assert_eq!(metas[2].name, "Zebra");
        assert_eq!(metas[1].id, "darkpeers-api");
    }

    #[test]
    fn load_parses_a_cached_definition() {
        let data = tmpdir("load");
        let store = DefinitionStore::new(data.path());
        std::fs::create_dir_all(store.dir()).unwrap();
        std::fs::write(store.dir().join("mytracker.yml"), valid_definition("t").as_bytes()).unwrap();

        let def = store.load("mytracker").expect("loads and parses");
        // The id comes from the file body, not the file name.
        assert_eq!(def.id, "t");
        assert_eq!(def.name, "My Tracker");
    }

    #[test]
    fn load_missing_definition_errors_with_a_hint() {
        let data = tmpdir("load-miss");
        let store = DefinitionStore::new(data.path());
        std::fs::create_dir_all(store.dir()).unwrap();
        let err = store.load("ghost").unwrap_err();
        assert!(format!("{err:#}").contains("not found"), "unexpected error: {err:#}");
    }


    #[test]
    fn yaml_extension_is_recognized_like_yml() {
        let data = tmpdir("yaml-ext");
        let store = DefinitionStore::new(data.path());
        std::fs::create_dir_all(store.dir()).unwrap();
        // `.yaml` counts for population + listing; `load` resolves `.yml` only.
        std::fs::write(store.dir().join("tracker.yaml"), valid_definition("t").as_bytes()).unwrap();
        assert!(store.is_populated());
        let metas = store.list().unwrap();
        assert_eq!(metas.len(), 1);
        assert_eq!(metas[0].id, "tracker");
    }

    #[test]
    fn listing_a_cache_that_was_never_synced_is_empty_not_an_error() {
        // The admin opens the browse page before ever syncing.
        let empty = scratch("empty");
        let store =
            DefinitionStore { dir: empty.path().join("never-created"), source: String::new() };
        assert!(store.list().unwrap().is_empty());
        assert!(!store.is_populated());
    }

    #[test]
    fn a_definition_file_that_does_not_parse_is_skipped_rather_than_fatal() {
        // One bad file upstream must not blank the whole browse list.
        let store = store_for(String::new());
        std::fs::create_dir_all(store.dir()).unwrap();
        std::fs::write(store.dir().join("good.yml"), DEMO_YML).unwrap();
        std::fs::write(store.dir().join("broken.yml"), "\t- : :\n").unwrap();
        std::fs::write(store.dir().join("notes.txt"), "ignored").unwrap();

        let listed = store.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "good");
    }

    #[test]
    fn an_id_that_escapes_the_cache_directory_is_refused() {
        let store = store_for(String::new());
        std::fs::create_dir_all(store.dir()).unwrap();
        let outside = store.dir().parent().unwrap().join("secret.yml");
        std::fs::write(&outside, DEMO_YML).unwrap();

        let err = store.load("../secret").unwrap_err().to_string();

        assert!(err.contains("not a definition id"), "{err}");
        assert!(store.load("..%2Fsecret").is_err());
        assert!(store.load("sub/secret").is_err());
        assert!(store.load("").is_err());
    }

    #[test]
    fn a_yml_entry_that_cannot_be_read_is_skipped_rather_than_fatal() {
        let store = store_for(String::new());
        std::fs::create_dir_all(store.dir().join("interrupted.yml")).unwrap();
        std::fs::write(store.dir().join("good.yml"), DEMO_YML).unwrap();

        let listed = store.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "good");
    }
}
