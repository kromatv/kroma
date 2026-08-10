//! Fetches the community-maintained Cardigann definition set at runtime and
//! caches it under the data directory. Not vendored: the definitions are GPL
//! and KROMA is MIT, so the server downloads them on demand instead.

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{bail, Context as _, Result};
use serde::{Deserialize, Serialize};

use crate::definition::{self, Definition};

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

    /// Downloads and extracts the current definition set, replacing the cache
    /// (extract to a temp dir, then swap the yml files in).
    pub fn sync(&self) -> Result<SyncReport> {
        std::fs::create_dir_all(&self.dir).context("create defs dir")?;
        let tmp = self.dir.join(".sync-tmp");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).context("create sync tmp")?;

        // curl, so the VPN proxy applies if one is set.
        let tarball = tmp.join("defs.tar.gz");
        let bytes = kroma_module_sdk::http::Fetch::new()
            .max_time(120)
            .get(&self.source)
            .context("download definitions")?
            .ensure_ok()?
            .body;
        std::fs::write(&tarball, &bytes).context("write tarball")?;

        let out = Command::new("tar")
            .arg("-xzf")
            .arg(&tarball)
            .arg("-C")
            .arg(&tmp)
            .output()
            .context("spawn tar")?;
        if !out.status.success() {
            bail!("tar failed: {}", String::from_utf8_lossy(&out.stderr).trim());
        }

        let defs_root = find_definitions_root(&tmp)
            .context("no definitions/ directory in the downloaded archive")?;
        let version = pick_version_dir(&defs_root)
            .context("no version directory under definitions/")?;
        let src = defs_root.join(&version);

        let mut count = 0;
        for entry in std::fs::read_dir(&src).context("read version dir")? {
            let entry = entry?;
            if is_yml(&entry) {
                let dest = self.dir.join(entry.file_name());
                std::fs::copy(entry.path(), dest)?;
                count += 1;
            }
        }
        let _ = std::fs::remove_dir_all(&tmp);

        if count == 0 {
            bail!("archive contained no definitions");
        }
        Ok(SyncReport { count, version })
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

    /// Load and fully parse one definition by id.
    pub fn load(&self, id: &str) -> Result<Definition> {
        let path = self.path_for(id);
        let bytes = std::fs::read(&path)
            .with_context(|| format!("definition '{id}' not found (run a definitions sync?)"))?;
        definition::parse(&bytes).with_context(|| format!("parse definition '{id}'"))
    }

    fn path_for(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.yml"))
    }
}

fn is_yml(entry: &std::fs::DirEntry) -> bool {
    entry.path().extension().is_some_and(|e| e == "yml" || e == "yaml")
}

fn find_definitions_root(tmp: &Path) -> Option<PathBuf> {
    for entry in std::fs::read_dir(tmp).ok()? {
        let entry = entry.ok()?;
        if entry.path().is_dir() {
            let candidate = entry.path().join("definitions");
            if candidate.is_dir() {
                return Some(candidate);
            }
        }
    }
    // Fallback: the archive might already be the definitions dir.
    let direct = tmp.join("definitions");
    direct.is_dir().then_some(direct)
}

fn pick_version_dir(defs_root: &Path) -> Option<String> {
    let mut best: Option<(u32, String)> = None;
    for entry in std::fs::read_dir(defs_root).ok()? {
        let entry = entry.ok()?;
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if let Some(n) = name.strip_prefix('v').and_then(|d| d.parse::<u32>().ok()) {
            if best.as_ref().is_none_or(|(bn, _)| n > *bn) {
                best = Some((n, name));
            }
        }
    }
    best.map(|(_, name)| name)
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn version_dir_picks_highest() {
        let tmp = kroma_testing::temp_dir("defs-test");
        let defs = tmp.path().join("definitions");
        for v in ["v1", "v9", "v11", "v10", "notaversion"] {
            std::fs::create_dir_all(defs.join(v)).unwrap();
        }
        assert_eq!(pick_version_dir(&defs).as_deref(), Some("v11"));
    }

    // The live end-to-end sync against the real upstream repo lives in
    // `tests/live_sync.rs`: it is `#[ignore]`d, so nothing here can run it.

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

    fn tmpdir(tag: &str) -> kroma_testing::TempDir {
        kroma_testing::temp_dir(&format!("store-test-{tag}"))
    }

    fn valid_definition(id: &str) -> String {
        format!(
            r#"
id: {id}
name: My Tracker
caps:
  modes:
    search: [q]
search:
  rows:
    selector: "tr"
"#
        )
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
    fn find_definitions_root_prefers_nested_then_falls_back() {
        let nested = tmpdir("root-nested");
        let want = nested.path().join("Indexers-master").join("definitions");
        std::fs::create_dir_all(&want).unwrap();
        assert_eq!(find_definitions_root(nested.path()).as_deref(), Some(want.as_path()));

        let direct = tmpdir("root-direct");
        let want = direct.path().join("definitions");
        std::fs::create_dir_all(&want).unwrap();
        assert_eq!(find_definitions_root(direct.path()).as_deref(), Some(want.as_path()));

        let empty = tmpdir("root-none");
        assert!(find_definitions_root(empty.path()).is_none());
    }

    #[test]
    fn version_dir_none_when_no_versioned_subdir() {
        let dir = tmpdir("ver-none");
        std::fs::create_dir_all(dir.path().join("stable")).unwrap();
        std::fs::create_dir_all(dir.path().join("vX")).unwrap();
        assert!(pick_version_dir(dir.path()).is_none());
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

    // sync() runs against a real socket serving .tar.gz bytes: the transport is
    // curl + the system tar, so this exercises the whole path.

    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    fn scratch(label: &str) -> kroma_testing::TempDir {
        kroma_testing::temp_dir(&format!("defs-{label}"))
    }

    const DEMO_YML: &str = "\
id: demo
name: Demo Tracker
type: public
description: A tracker for the tests
links:
  - https://demo.example/
caps: {}
search:
  rows: {}
";

    // Builds a `.tar.gz` laid out the way the upstream repo is; `layout` maps a
    // path inside the archive to its contents.
    fn tarball(layout: &[(&str, &str)]) -> Vec<u8> {
        let root = scratch("tar");
        for (path, body) in layout {
            let full = root.path().join(path);
            std::fs::create_dir_all(full.parent().unwrap()).unwrap();
            std::fs::write(&full, body).unwrap();
        }
        let archive = root.path().join("out.tar.gz");
        let entries: Vec<String> = std::fs::read_dir(root.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n != "out.tar.gz")
            .collect();
        let ok = Command::new("tar")
            .arg("-czf")
            .arg(&archive)
            .arg("-C")
            .arg(root.path())
            .args(&entries)
            .status()
            .unwrap();
        assert!(ok.success(), "could not build the fixture archive");
        std::fs::read(&archive).unwrap()
    }

    fn serve(status: u16, body: Vec<u8>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                        break;
                    }
                }
                let head = format!(
                    "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nContent-Type: application/gzip\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(&body);
                let _ = stream.flush();
            }
        });
        format!("http://127.0.0.1:{port}/master.tar.gz")
    }

    struct TempStore {
        store: DefinitionStore,
        _dir: kroma_testing::TempDir,
    }

    impl std::ops::Deref for TempStore {
        type Target = DefinitionStore;

        fn deref(&self) -> &DefinitionStore {
            &self.store
        }
    }

    fn store_for(source: String) -> TempStore {
        let dir = scratch("cache");
        TempStore { store: DefinitionStore { dir: dir.path().to_path_buf(), source }, _dir: dir }
    }

    #[test]
    fn a_sync_extracts_the_highest_schema_version_and_nothing_else() {
        let bytes = tarball(&[
            ("Indexers-master/definitions/v1/ancient.yml", DEMO_YML),
            ("Indexers-master/definitions/v9/demo.yml", DEMO_YML),
            ("Indexers-master/definitions/v11/demo.yml", DEMO_YML),
            ("Indexers-master/definitions/v11/other.yaml", DEMO_YML),
            ("Indexers-master/definitions/v11/README.md", "not a definition"),
            ("Indexers-master/README.md", "ignored"),
        ]);
        let store = store_for(serve(200, bytes));
        assert!(!store.is_populated(), "nothing cached before the first sync");

        let report = store.sync().unwrap();
        assert_eq!(report.version, "v11");
        assert_eq!(report.count, 2, "the .md is not a definition");
        assert!(store.is_populated());

        // The files landed flat in the cache, and the scratch dir is gone.
        assert!(store.dir().join("demo.yml").is_file());
        assert!(store.dir().join("other.yaml").is_file());
        assert!(!store.dir().join(".sync-tmp").exists(), "the temp dir was left behind");
        assert!(!store.dir().join("ancient.yml").exists(), "an older version leaked in");
    }

    #[test]
    fn a_synced_definition_can_be_listed_and_loaded() {
        let bytes = tarball(&[("Indexers-master/definitions/v9/demo.yml", DEMO_YML)]);
        let store = store_for(serve(200, bytes));
        store.sync().unwrap();

        let listed = store.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Demo Tracker");
        assert_eq!(listed[0].kind, "public");
        assert_eq!(listed[0].links, ["https://demo.example/"]);
        // The id is the FILE STEM, not the internal `id` - that is what a saved
        // indexer stores and what `load` resolves.
        assert_eq!(listed[0].id, "demo");

        let parsed = store.load("demo").unwrap();
        assert_eq!(parsed.name, "Demo Tracker");
    }

    #[test]
    fn a_definition_whose_filename_differs_from_its_internal_id_is_keyed_by_the_file() {
        // Real definitions do this (`darkpeers-api.yml` carries `id: darkpeers`).
        // Keying on the internal id would make the row unloadable.
        let bytes =
            tarball(&[("Indexers-master/definitions/v9/demo-api.yml", DEMO_YML)]);
        let store = store_for(serve(200, bytes));
        store.sync().unwrap();

        let listed = store.list().unwrap();
        assert_eq!(listed[0].id, "demo-api", "the internal id was 'demo'");
        assert!(store.load("demo-api").is_ok());
        assert!(store.load("demo").is_err(), "the internal id must not resolve");
    }

    #[test]
    fn an_archive_that_already_is_the_definitions_directory_still_works() {
        // Not every mirror wraps the tree in a `<repo>-<branch>/` folder.
        let bytes = tarball(&[("definitions/v9/demo.yml", DEMO_YML)]);
        let store = store_for(serve(200, bytes));
        assert_eq!(store.sync().unwrap().count, 1);
    }

    #[test]
    fn a_sync_replaces_what_was_cached_before() {
        // The admin re-syncs to pick up upstream fixes, so a second run must
        // overwrite rather than fail on the existing files.
        let first = tarball(&[("Indexers-master/definitions/v9/demo.yml", DEMO_YML)]);
        let store = store_for(serve(200, first));
        store.sync().unwrap();
        let before = std::fs::read_to_string(store.dir().join("demo.yml")).unwrap();

        let updated = DEMO_YML.replace("Demo Tracker", "Demo Tracker (renamed)");
        let second = tarball(&[("Indexers-master/definitions/v9/demo.yml", &updated)]);
        let store = DefinitionStore { dir: store.dir().to_path_buf(), source: serve(200, second) };
        store.sync().unwrap();

        let after = std::fs::read_to_string(store.dir().join("demo.yml")).unwrap();
        assert_ne!(before, after);
        assert_eq!(store.list().unwrap()[0].name, "Demo Tracker (renamed)");
    }

    #[test]
    fn every_way_a_sync_can_fail_says_which_one_it_was() {
        // These land in an admin toast, so "sync failed" alone is not enough to
        // act on.
        let unreachable = store_for("http://127.0.0.1:1/nope.tar.gz".into());
        assert!(unreachable.sync().is_err(), "an unreachable source");

        let missing = store_for(serve(404, b"not found".to_vec()));
        assert!(missing.sync().is_err(), "a 404 from the source");

        let not_an_archive = store_for(serve(200, b"this is not a gzip stream".to_vec()));
        let err = not_an_archive.sync().unwrap_err().to_string();
        assert!(err.contains("tar failed"), "{err}");

        let wrong_shape = store_for(serve(200, tarball(&[("Indexers-master/README.md", "x")])));
        let err = wrong_shape.sync().unwrap_err().to_string();
        assert!(err.contains("no definitions/"), "{err}");

        let no_versions =
            store_for(serve(200, tarball(&[("Indexers-master/definitions/readme.txt", "x")])));
        let err = no_versions.sync().unwrap_err().to_string();
        assert!(err.contains("no version directory"), "{err}");

        let empty_version =
            store_for(serve(200, tarball(&[("Indexers-master/definitions/v9/notes.txt", "x")])));
        let err = empty_version.sync().unwrap_err().to_string();
        assert!(err.contains("no definitions"), "{err}");
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
    fn a_yml_entry_that_cannot_be_read_is_skipped_rather_than_fatal() {
        let store = store_for(String::new());
        std::fs::create_dir_all(store.dir().join("interrupted.yml")).unwrap();
        std::fs::write(store.dir().join("good.yml"), DEMO_YML).unwrap();

        let listed = store.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "good");
    }
}
