//! Gathers the shared message catalogs, every `.json` under
//! `packages/core/src/locales/<locale>/`, into one `include_str!` list, so the
//! server embeds exactly the files the TypeScript clients bundle without naming
//! each namespace by hand. `i18n.json` beside the folders says which of them a
//! reader is offered, and those are the ones embedded. The release
//! notes under `releases/<version>/` are gathered the same way, and so are the
//! sign-in presets, one folder each under `src/services/sso/presets/`.

use std::env;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

#[path = "src/i18n/policy.rs"]
mod policy;

use policy::{Policy, Stage};

const LOCALES: &str = "../../../packages/core/src/locales";
const PROJECT: &str = "i18n.json";
const RELEASES: &str = "../../../releases";
const PRESETS: &str = "src/services/sso/presets";

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    write_catalog_parts(&manifest, &out_dir);
    write_release_parts(&manifest, &out_dir);
    write_preset_parts(&manifest, &out_dir);
}

fn write_catalog_parts(manifest: &Path, out_dir: &Path) {
    let locales = manifest
        .join(LOCALES)
        .canonicalize()
        .expect("the shared catalogs live in packages/core/src/locales");
    rerun_if_changed(&locales);
    let project = locales.join(PROJECT);
    rerun_if_changed(&project);
    let policy = fs::read_to_string(&project)
        .map_err(|e| e.to_string())
        .and_then(|json| Policy::parse(&json))
        .unwrap_or_else(|e| panic!("{}: {e}", project.display()));

    let folders: Vec<String> = sorted_children(&locales, Path::is_dir)
        .iter()
        .map(|folder| file_name(folder).to_owned())
        .collect();
    let offered: Vec<&String> = folders.iter().filter(|c| policy.offered(c)).collect();
    let exists = |code: &str| offered.iter().any(|known| *known == code);

    let mut parts = Vec::new();
    let mut chains = Vec::new();
    for code in &offered {
        for file in catalog_files(&locales.join(code)) {
            rerun_if_changed(&file);
            let within = file
                .strip_prefix(&locales)
                .expect("a catalog file is under the catalog folder")
                .components()
                .map(|part| part.as_os_str().to_str().expect("a catalog path is UTF-8"))
                .collect::<Vec<_>>()
                .join("/");
            // Relative to the crate being compiled rather than canonical, so a
            // target dir shared between checkouts never embeds another checkout's
            // catalogs, and rustc tracks this checkout's files for rebuilds.
            let rel = format!("{LOCALES}/{within}");
            parts.push(format!(
                "    ({code:?}, include_str!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/{rel}\"))),"
            ));
        }
        if policy.stage(code) != Stage::Stable {
            let rest = &policy.chain(code, &exists)[1..];
            chains.push(format!("    ({code:?}, &{rest:?}),"));
        }
    }

    let body = format!(
        "pub(crate) const SOURCE: &str = {:?};\n\
         pub(crate) const FALLBACK: Option<&str> = {:?};\n\
         pub(crate) const LOCALES: &[&str] = &{offered:?};\n\
         pub(crate) const FALLBACKS: &[(&str, &[&str])] = &[\n{}\n];\n\
         pub(crate) const CATALOG_PARTS: &[(&str, &str)] = &[\n{}\n];\n",
        policy.source,
        policy.fallback,
        chains.join("\n"),
        parts.join("\n")
    );
    fs::write(out_dir.join("catalog_parts.rs"), body).expect("write catalog_parts.rs");
}

// Every `.json` under a locale folder, however deep: a namespace may be one
// file or a folder of them. The lock beside them is not a catalog.
fn catalog_files(dir: &Path) -> Vec<PathBuf> {
    rerun_if_changed(dir);
    let mut files = Vec::new();
    for child in sorted_children(dir, |_| true) {
        if child.is_dir() {
            files.extend(catalog_files(&child));
        } else if child.extension().is_some_and(|e| e == "json") {
            files.push(child);
        }
    }
    files
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

fn write_preset_parts(manifest: &Path, out_dir: &Path) {
    let presets = manifest.join(PRESETS);
    rerun_if_changed(&presets);

    let mut parts = Vec::new();
    for preset in sorted_children(&presets, Path::is_dir) {
        rerun_if_changed(&preset);
        let id = file_name(&preset).to_owned();
        for file in sorted_children(&preset, is_preset_file) {
            rerun_if_changed(&file);
            let name = file_name(&file);
            let rel = format!("{PRESETS}/{id}/{name}");
            parts.push(format!(
                "    ({id:?}, {name:?}, include_bytes!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/{rel}\"))),"
            ));
        }
    }

    let body = format!(
        "pub(crate) const PRESET_FILES: &[(&str, &str, &[u8])] = &[\n{}\n];\n",
        parts.join("\n")
    );
    fs::write(out_dir.join("preset_parts.rs"), body).expect("write preset_parts.rs");
}

fn is_preset_file(path: &Path) -> bool {
    path.extension().is_some_and(|e| e == "svg" || e == "png")
        || path.file_name() == Some(OsStr::new("preset.json"))
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
