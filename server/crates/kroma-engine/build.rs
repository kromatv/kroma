//! Gathers the shared message catalogs, `packages/core/src/locales/<locale>/<namespace>.json`,
//! into one `include_str!` list, so the server embeds exactly the files the
//! TypeScript clients bundle without naming each namespace by hand.

use std::env;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

const LOCALES: &str = "../../../packages/core/src/locales";

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let locales = manifest
        .join(LOCALES)
        .canonicalize()
        .expect("the shared catalogs live in packages/core/src/locales");
    rerun_if_changed(&locales);

    let mut codes = Vec::new();
    let mut parts = Vec::new();
    for locale in sorted_children(&locales, Path::is_dir) {
        rerun_if_changed(&locale);
        let code = locale
            .file_name()
            .and_then(OsStr::to_str)
            .expect("a locale folder is named after its code")
            .to_owned();
        for file in sorted_children(&locale, |p| p.extension().is_some_and(|e| e == "json")) {
            rerun_if_changed(&file);
            let path = file.display().to_string();
            parts.push(format!("    ({code:?}, include_str!({path:?})),"));
        }
        codes.push(format!("{code:?}"));
    }

    let out = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR")).join("catalog_parts.rs");
    let body = format!(
        "pub(crate) const LOCALES: &[&str] = &[{}];\n\
         pub(crate) const CATALOG_PARTS: &[(&str, &str)] = &[\n{}\n];\n",
        codes.join(", "),
        parts.join("\n")
    );
    fs::write(&out, body).expect("write catalog_parts.rs");
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
