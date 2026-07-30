//! Proc-macros for KROMA modules. [`embedded_module!`] finds a module's
//! `module.json` and `icon.<ext>` by convention - the module root is the parent
//! of the server crate - and expands to the right `EmbeddedModule` constructor.

use proc_macro::TokenStream;
use std::path::{Path, PathBuf};

/// Builds the `MODULE` const for a module server crate. Takes no arguments.
#[proc_macro]
pub fn embedded_module(_input: TokenStream) -> TokenStream {
    // The proc-macro runs inside the caller's rustc, so CARGO_MANIFEST_DIR is the
    // CALLER's crate dir: `<module>/server`, whose parent is the module root.
    let manifest_dir = match std::env::var("CARGO_MANIFEST_DIR") {
        Ok(dir) => dir,
        Err(_) => return compile_error("embedded_module!(): CARGO_MANIFEST_DIR is not set"),
    };
    let module_root = match Path::new(&manifest_dir).parent() {
        Some(p) => p.to_path_buf(),
        None => return compile_error("embedded_module!(): the server crate has no parent dir"),
    };

    let manifest_json = module_root.join("module.json");
    if !manifest_json.exists() {
        return compile_error(&format!(
            "embedded_module!(): no module.json at {}",
            manifest_json.display()
        ));
    }
    let json_path = manifest_json.to_string_lossy();

    // `EmbeddedModule` is emitted unqualified so it resolves against whatever the
    // caller has in scope; the parsed tokens carry call-site hygiene, so the macro
    // never has to hardcode a crate path.
    let expanded = match find_icon(&module_root) {
        Some((icon_path, mime)) => {
            let icon_path = icon_path.to_string_lossy();
            format!(
                "EmbeddedModule::with_icon(include_str!({json:?}), include_bytes!({icon:?}), {mime:?})"
            , json = json_path, icon = icon_path, mime = mime)
        }
        None => format!("EmbeddedModule::iconless(include_str!({json:?}))", json = json_path),
    };

    expanded.parse().expect("embedded_module!(): generated a valid const expression")
}

fn find_icon(dir: &Path) -> Option<(PathBuf, &'static str)> {
    const CANDIDATES: &[(&str, &str)] = &[
        ("svg", "image/svg+xml"),
        ("png", "image/png"),
        ("webp", "image/webp"),
        ("jpg", "image/jpeg"),
        ("jpeg", "image/jpeg"),
        ("gif", "image/gif"),
        ("avif", "image/avif"),
        ("ico", "image/x-icon"),
    ];
    for (ext, mime) in CANDIDATES {
        let path = dir.join(format!("icon.{ext}"));
        if path.exists() {
            return Some((path, mime));
        }
    }
    None
}

fn compile_error(message: &str) -> TokenStream {
    format!("compile_error!({message:?})").parse().expect("compile_error! parses")
}
