use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use crate::{notices, Collected, Manifest, Metadata};

struct Build {
    cargo: PathBuf,
    manifest: PathBuf,
    target: String,
}

fn var(key: &str) -> String {
    env::var(key).unwrap_or_else(|_| panic!("cargo sets {key} for a build script"))
}

impl Build {
    fn from_env() -> Self {
        Self {
            cargo: var("CARGO").into(),
            manifest: Path::new(&var("CARGO_MANIFEST_DIR")).join("Cargo.toml"),
            target: var("TARGET"),
        }
    }

    fn collect(&self) -> (Manifest, Option<String>) {
        match Metadata::read(&self.cargo, &self.manifest, &self.target) {
            Ok(metadata) => {
                let Collected { manifest, unresolved } = notices(&metadata);
                let warning = (!unresolved.is_empty()).then(|| {
                    format!(
                        "third-party notices: no license text found for {}; add its license to kroma-notices/spdx",
                        unresolved.join(", ")
                    )
                });
                (manifest, warning)
            }
            Err(err) => (Manifest::default(), Some(format!("third-party notices left empty: {err}"))),
        }
    }
}

fn warning_line(message: &str, ci: bool) -> String {
    assert!(!ci, "{message}");
    format!("cargo:warning={message}")
}

/// For the build script of a workspace's root package: writes the notices of
/// every crate it links on the target being built to `$OUT_DIR/<file>`, for
/// `include_str!`. A crate with no text, or no `cargo metadata` at all, is a
/// warning, and fails the build when `CI` is set.
pub fn emit(file: &str) {
    println!("cargo:rerun-if-changed=Cargo.lock");
    println!("cargo:rerun-if-env-changed=CI");
    let (manifest, warning) = Build::from_env().collect();
    if let Some(message) = warning {
        println!("{}", warning_line(&message, env::var_os("CI").is_some()));
    }
    let json = serde_json::to_string(&manifest).expect("the notices serialize");
    let path = PathBuf::from(var("OUT_DIR")).join(file);
    fs::write(&path, json).unwrap_or_else(|err| panic!("writing {}: {err}", path.display()));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build(manifest: PathBuf) -> Build {
        Build {
            cargo: env::var_os("CARGO").map_or_else(|| PathBuf::from("cargo"), PathBuf::from),
            manifest,
            target: "x86_64-unknown-linux-gnu".into(),
        }
    }

    #[test]
    fn collects_the_crates_this_crate_links() {
        let own = build(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"));

        let (manifest, warning) = own.collect();

        assert!(warning.is_none());
        assert!(manifest.entries.iter().any(|entry| entry.name == "serde_json"));
        assert!(manifest.entries.iter().all(|entry| !entry.texts.is_empty()));
    }

    #[test]
    fn warns_and_lists_nothing_when_cargo_metadata_fails() {
        let dir = kroma_testing::temp_dir("notices-build");
        let broken = build(dir.path().join("Cargo.toml"));

        let (manifest, warning) = broken.collect();

        assert_eq!(manifest, Manifest::default());
        assert!(warning.unwrap().starts_with("third-party notices left empty"));
    }

    #[test]
    fn prints_a_warning_outside_ci() {
        let line = warning_line("no text for a 1.0", false);

        assert_eq!(line, "cargo:warning=no text for a 1.0");
    }

    #[test]
    #[should_panic(expected = "no text for a 1.0")]
    fn fails_the_build_under_ci() {
        warning_line("no text for a 1.0", true);
    }
}
