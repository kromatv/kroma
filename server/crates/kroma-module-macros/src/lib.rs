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
    expansion(std::env::var("CARGO_MANIFEST_DIR").ok())
        .parse()
        .expect("embedded_module!(): generated a valid const expression")
}

fn expansion(manifest_dir: Option<String>) -> String {
    let Some(manifest_dir) = manifest_dir else {
        return compile_error("embedded_module!(): CARGO_MANIFEST_DIR is not set");
    };
    let Some(module_root) = Path::new(&manifest_dir).parent().map(Path::to_path_buf) else {
        return compile_error("embedded_module!(): the server crate has no parent dir");
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
    match find_icon(&module_root) {
        Some((icon_path, mime)) => {
            let icon_path = icon_path.to_string_lossy();
            format!(
                "EmbeddedModule::with_icon(include_str!({json:?}), include_bytes!({icon:?}), {mime:?})"
            , json = json_path, icon = icon_path, mime = mime)
        }
        None => format!(
            "EmbeddedModule::iconless(include_str!({json:?}))",
            json = json_path
        ),
    }
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

fn compile_error(message: &str) -> String {
    format!("compile_error!({message:?})")
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Scratch(kroma_testing::TempDir);

    impl Scratch {
        fn new(tag: &str) -> Self {
            let scratch = Self(kroma_testing::temp_dir(tag));
            std::fs::create_dir_all(scratch.0.path().join("server")).expect("scratch dir");
            scratch
        }

        fn write(&self, name: &str, bytes: &[u8]) {
            std::fs::write(self.0.path().join(name), bytes).expect("write");
        }

        fn expand(&self) -> String {
            expansion(Some(
                self.0.path().join("server").to_string_lossy().to_string(),
            ))
        }
    }

    #[test]
    fn a_module_root_with_no_icon_file_is_not_an_error() {
        assert!(find_icon(Path::new(env!("CARGO_MANIFEST_DIR"))).is_none());
    }

    #[test]
    fn a_build_that_names_no_crate_directory_fails_the_compile_by_name() {
        let out = expansion(None);
        assert!(out.starts_with("compile_error!"), "{out}");
        assert!(out.contains("CARGO_MANIFEST_DIR"), "{out}");
    }

    #[test]
    fn a_crate_directory_with_nothing_above_it_cannot_hold_a_module() {
        let out = expansion(Some(String::new()));
        assert!(out.contains("no parent dir"), "{out}");
    }

    #[test]
    fn a_server_crate_with_no_module_beside_it_says_where_it_looked() {
        let scratch = Scratch::new("no-manifest");
        let out = scratch.expand();
        assert!(out.starts_with("compile_error!"), "{out}");
        assert!(out.contains("module.json"), "{out}");
    }

    #[test]
    fn a_module_without_an_icon_still_embeds_its_manifest() {
        let scratch = Scratch::new("iconless");
        scratch.write("module.json", br#"{"id":"com.example.demo"}"#);

        let out = scratch.expand();
        assert!(out.starts_with("EmbeddedModule::iconless("), "{out}");
        assert!(out.contains("module.json"), "{out}");
    }

    #[test]
    fn the_first_icon_extension_that_exists_is_the_one_embedded() {
        let scratch = Scratch::new("icon");
        scratch.write("module.json", br#"{"id":"com.example.demo"}"#);
        scratch.write("icon.png", b"\x89PNG");
        scratch.write("icon.svg", b"<svg/>");

        let out = scratch.expand();
        assert!(out.starts_with("EmbeddedModule::with_icon("), "{out}");
        assert!(out.contains("icon.svg"), "svg outranks png: {out}");
        assert!(out.contains("\"image/svg+xml\""), "{out}");
    }
}
