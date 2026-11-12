use std::path::{Path, PathBuf};

const SKIPPED_DIRECTORIES: [&str; 3] = ["target", "node_modules", ".git"];

/// Every `.rs` file under `root`, sorted: what a guard test reads to hold the
/// whole tree to a rule. Build output and version control (`target`,
/// `node_modules`, `.git`) are not walked.
pub fn rust_sources(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                if !SKIPPED_DIRECTORIES
                    .iter()
                    .any(|skipped| entry.file_name() == *skipped)
                {
                    pending.push(path);
                }
            } else if path.extension().is_some_and(|ext| ext == "rs") {
                found.push(path);
            }
        }
    }
    found.sort();
    found
}

/// One line a guard test objects to, and why.
pub struct Finding {
    pub line: usize,
    pub reason: &'static str,
}

/// What `check` finds in the Rust sources under each of `roots` in `repo`, one
/// `path:line: reason` per finding with the path relative to `repo`. A file
/// whose relative path starts with one of `exempt` is not read.
pub fn findings(
    repo: &Path,
    roots: &[&str],
    exempt: &[&str],
    check: impl Fn(&str) -> Vec<Finding>,
) -> Vec<String> {
    roots
        .iter()
        .flat_map(|root| rust_sources(&repo.join(root)))
        .filter_map(|path| {
            let relative = path
                .strip_prefix(repo)
                .ok()?
                .to_string_lossy()
                .replace('\\', "/");
            if exempt.iter().any(|prefix| relative.starts_with(prefix)) {
                return None;
            }
            let source = std::fs::read_to_string(&path).ok()?;
            Some(
                check(&source)
                    .into_iter()
                    .map(move |finding| format!("{relative}:{}: {}", finding.line, finding.reason)),
            )
        })
        .flatten()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::temp_dir;

    #[test]
    fn every_rust_file_is_found_and_build_output_is_not() {
        let dir = temp_dir("sources");
        let root = dir.path();
        for file in [
            "lib.rs",
            "nested/deeper/mod.rs",
            "target/debug/build.rs",
            "node_modules/pkg/index.rs",
            ".git/hooks/hook.rs",
            "notes.md",
        ] {
            let at = root.join(file);
            std::fs::create_dir_all(at.parent().unwrap()).unwrap();
            std::fs::write(&at, "").unwrap();
        }

        let found = rust_sources(root);

        assert_eq!(
            found,
            [root.join("lib.rs"), root.join("nested/deeper/mod.rs")]
        );
    }

    #[test]
    fn a_finding_names_its_file_and_line_and_an_exempt_file_is_not_read() {
        let dir = temp_dir("findings");
        let repo = dir.path();
        for (file, text) in [
            ("server/a.rs", "bad\nfine\nbad\n"),
            ("server/allowed/b.rs", "bad\n"),
            ("elsewhere/c.rs", "bad\n"),
        ] {
            let at = repo.join(file);
            std::fs::create_dir_all(at.parent().unwrap()).unwrap();
            std::fs::write(&at, text).unwrap();
        }
        let check = |source: &str| {
            source
                .lines()
                .enumerate()
                .filter(|(_, text)| *text == "bad")
                .map(|(index, _)| Finding {
                    line: index + 1,
                    reason: "says bad",
                })
                .collect()
        };

        let found = findings(repo, &["server"], &["server/allowed/"], check);

        assert_eq!(
            found,
            ["server/a.rs:1: says bad", "server/a.rs:3: says bad"]
        );
    }

    #[test]
    fn a_root_that_does_not_exist_has_no_sources() {
        let dir = temp_dir("sources-missing");

        let found = rust_sources(&dir.path().join("absent"));

        assert!(found.is_empty());
    }
}
