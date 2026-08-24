use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{bail, Context as _, Result};

use super::{is_yml, DefinitionStore, SyncReport};

impl DefinitionStore {
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
            bail!(
                "tar failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            );
        }

        let defs_root = find_definitions_root(&tmp)
            .context("no definitions/ directory in the downloaded archive")?;
        let version =
            pick_version_dir(&defs_root).context("no version directory under definitions/")?;
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
    use super::super::test_support::{serve, store_for, tarball, tmpdir, DEMO_YML};
    use super::*;

    // The live end-to-end sync against the real upstream repo lives in
    // `tests/live_sync.rs`: it is `#[ignore]`d, so nothing here can run it.

    #[test]
    fn version_dir_picks_highest() {
        let tmp = kroma_testing::temp_dir("defs-test");
        let defs = tmp.path().join("definitions");
        for v in ["v1", "v9", "v11", "v10", "notaversion"] {
            std::fs::create_dir_all(defs.join(v)).unwrap();
        }
        assert_eq!(pick_version_dir(&defs).as_deref(), Some("v11"));
    }

    #[test]
    fn find_definitions_root_prefers_nested_then_falls_back() {
        let nested = tmpdir("root-nested");
        let want = nested.path().join("Indexers-master").join("definitions");
        std::fs::create_dir_all(&want).unwrap();
        assert_eq!(
            find_definitions_root(nested.path()).as_deref(),
            Some(want.as_path())
        );

        let direct = tmpdir("root-direct");
        let want = direct.path().join("definitions");
        std::fs::create_dir_all(&want).unwrap();
        assert_eq!(
            find_definitions_root(direct.path()).as_deref(),
            Some(want.as_path())
        );

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
    fn a_sync_extracts_the_highest_schema_version_and_nothing_else() {
        let bytes = tarball(&[
            ("Indexers-master/definitions/v1/ancient.yml", DEMO_YML),
            ("Indexers-master/definitions/v9/demo.yml", DEMO_YML),
            ("Indexers-master/definitions/v11/demo.yml", DEMO_YML),
            ("Indexers-master/definitions/v11/other.yaml", DEMO_YML),
            (
                "Indexers-master/definitions/v11/README.md",
                "not a definition",
            ),
            ("Indexers-master/README.md", "ignored"),
        ]);
        let store = store_for(serve(200, bytes));
        assert!(
            !store.is_populated(),
            "nothing cached before the first sync"
        );

        let report = store.sync().unwrap();
        assert_eq!(report.version, "v11");
        assert_eq!(report.count, 2, "the .md is not a definition");
        assert!(store.is_populated());

        // The files landed flat in the cache, and the scratch dir is gone.
        assert!(store.dir().join("demo.yml").is_file());
        assert!(store.dir().join("other.yaml").is_file());
        assert!(
            !store.dir().join(".sync-tmp").exists(),
            "the temp dir was left behind"
        );
        assert!(
            !store.dir().join("ancient.yml").exists(),
            "an older version leaked in"
        );
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
        let bytes = tarball(&[("Indexers-master/definitions/v9/demo-api.yml", DEMO_YML)]);
        let store = store_for(serve(200, bytes));
        store.sync().unwrap();

        let listed = store.list().unwrap();
        assert_eq!(listed[0].id, "demo-api", "the internal id was 'demo'");
        assert!(store.load("demo-api").is_ok());
        assert!(
            store.load("demo").is_err(),
            "the internal id must not resolve"
        );
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
        let store = DefinitionStore {
            dir: store.dir().to_path_buf(),
            source: serve(200, second),
        };
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

        let no_versions = store_for(serve(
            200,
            tarball(&[("Indexers-master/definitions/readme.txt", "x")]),
        ));
        let err = no_versions.sync().unwrap_err().to_string();
        assert!(err.contains("no version directory"), "{err}");

        let empty_version = store_for(serve(
            200,
            tarball(&[("Indexers-master/definitions/v9/notes.txt", "x")]),
        ));
        let err = empty_version.sync().unwrap_err().to_string();
        assert!(err.contains("no definitions"), "{err}");
    }
}
