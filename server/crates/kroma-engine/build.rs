//! Gathers the shared message catalogs, `packages/core/src/locales/<locale>/<namespace>.json`,
//! into one `include_str!` list, so the server embeds exactly the files the
//! TypeScript clients bundle without naming each namespace by hand. The release
//! notes under `releases/<version>/` are gathered the same way.

use std::env;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

const LOCALES: &str = "../../../packages/core/src/locales";
const RELEASES: &str = "../../../releases";

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    write_catalog_parts(&manifest, &out_dir);
    write_release_parts(&manifest, &out_dir);
}

fn write_catalog_parts(manifest: &Path, out_dir: &Path) {
    let locales = manifest
        .join(LOCALES)
        .canonicalize()
        .expect("the shared catalogs live in packages/core/src/locales");
    rerun_if_changed(&locales);

    let mut codes = Vec::new();
    let mut parts = Vec::new();
    for locale in sorted_children(&locales, Path::is_dir) {
        rerun_if_changed(&locale);
        let code = file_name(&locale).to_owned();
        for file in sorted_children(&locale, |p| p.extension().is_some_and(|e| e == "json")) {
            rerun_if_changed(&file);
            let path = file.display().to_string();
            parts.push(format!("    ({code:?}, include_str!({path:?})),"));
        }
        codes.push(format!("{code:?}"));
    }

    let body = format!(
        "pub(crate) const LOCALES: &[&str] = &[{}];\n\
         pub(crate) const CATALOG_PARTS: &[(&str, &str)] = &[\n{}\n];\n",
        codes.join(", "),
        parts.join("\n")
    );
    fs::write(out_dir.join("catalog_parts.rs"), body).expect("write catalog_parts.rs");
}

fn write_release_parts(manifest: &Path, out_dir: &Path) {
    let mut parts = Vec::new();
    let releases = manifest.join(RELEASES);
    rerun_if_changed(&releases);
    if let Ok(releases) = releases.canonicalize() {
        for release in sorted_children(&releases, Path::is_dir) {
            rerun_if_changed(&release);
            let version = file_name(&release).to_owned();
            for file in sorted_children(&release, is_release_file) {
                rerun_if_changed(&file);
                let name = file_name(&file);
                let path = file.display().to_string();
                parts.push(format!("    ({version:?}, {name:?}, include_str!({path:?})),"));
            }
        }
    }

    let body = format!(
        "pub(crate) const RELEASE_FILES: &[(&str, &str, &str)] = &[\n{}\n];\n",
        parts.join("\n")
    );
    fs::write(out_dir.join("release_parts.rs"), body).expect("write release_parts.rs");
}

fn is_release_file(path: &Path) -> bool {
    path.extension().is_some_and(|e| e == "md") || path.file_name() == Some(OsStr::new("release.json"))
}

fn file_name(path: &Path) -> &str {
    path.file_name()
        .and_then(OsStr::to_str)
        .expect("a catalog or release path is valid UTF-8")
}

fn sorted_children(dir: &Path, keep: fn(&Path) -> bool) -> Vec<PathBuf> {
    let mut children: Vec<PathBuf> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| keep(path))
        .collect();
    children.sort();
    children
}

fn rerun_if_changed(path: &Path) {
    println!("cargo:rerun-if-changed={}", path.display());
}
