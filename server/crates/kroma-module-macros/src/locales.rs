use std::path::{Path, PathBuf};

use crate::compile_error;

pub(crate) fn expansion(manifest_dir: Option<String>) -> String {
    let Some(manifest_dir) = manifest_dir else {
        return compile_error("embedded_locales!(): CARGO_MANIFEST_DIR is not set");
    };
    let Some(module_root) = Path::new(&manifest_dir).parent() else {
        return compile_error("embedded_locales!(): the server crate has no parent dir");
    };
    let catalogs: Vec<String> = find_catalogs(&module_root.join("locales"))
        .iter()
        .map(|(code, path)| format!("({code:?}, include_str!({:?}))", path.to_string_lossy()))
        .collect();
    format!("&[{}]", catalogs.join(", "))
}

fn find_catalogs(dir: &Path) -> Vec<(String, PathBuf)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    let mut catalogs = if paths.iter().any(|path| path.is_dir()) {
        folder_catalogs(&paths)
    } else {
        flat_catalogs(paths)
    };
    catalogs.sort();
    catalogs
}

fn is_catalog(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext == "json")
}

fn flat_catalogs(paths: Vec<PathBuf>) -> Vec<(String, PathBuf)> {
    paths
        .into_iter()
        .filter(|path| is_catalog(path))
        .filter_map(|path| {
            let code = path.file_stem()?.to_string_lossy().into_owned();
            Some((code, path))
        })
        .collect()
}

fn folder_catalogs(paths: &[PathBuf]) -> Vec<(String, PathBuf)> {
    let mut catalogs = Vec::new();
    for locale in paths.iter().filter(|path| path.is_dir()) {
        let Some(code) = locale.file_name() else {
            continue;
        };
        let code = code.to_string_lossy();
        let mut files = Vec::new();
        collect_catalogs(locale, &mut files);
        catalogs.extend(files.into_iter().map(|file| (code.to_string(), file)));
    }
    catalogs
}

fn collect_catalogs(dir: &Path, found: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for path in entries.flatten().map(|entry| entry.path()) {
        if path.is_dir() {
            collect_catalogs(&path, found);
        } else if is_catalog(&path) {
            found.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::Scratch;

    #[test]
    fn every_catalogue_beside_the_manifest_is_embedded_under_its_locale_code() {
        let scratch = Scratch::new("locales");
        scratch.write_locale("fr.json", br#"{"a":"un"}"#);
        scratch.write_locale("en.json", br#"{"a":"one"}"#);
        scratch.write_locale("notes.md", b"not a catalogue");

        let out = scratch.expand_locales();
        assert!(out.starts_with(r#"&[("en", include_str!("#), "{out}");
        assert!(out.contains(r#"("fr", include_str!("#), "{out}");
        assert!(!out.contains("notes"), "{out}");
    }

    #[test]
    fn one_file_per_language_expands_to_one_pair_per_code_in_code_order() {
        let scratch = Scratch::new("flat-locales");
        scratch.write_locale("fr.json", br#"{"a":"un"}"#);
        scratch.write_locale("en.json", br#"{"a":"one"}"#);
        scratch.write_locale("fr.lock", b"{}");

        let out = scratch.expand_locales();

        let en = scratch.included("en", "en.json");
        let fr = scratch.included("fr", "fr.json");
        assert_eq!(out, format!("&[{en}, {fr}]"));
    }

    #[test]
    fn one_folder_per_language_expands_to_one_pair_per_file_in_path_order() {
        let scratch = Scratch::new("folder-locales");
        scratch.write_locale("fr/nav.json", br#"{"nav.a":"un"}"#);
        scratch.write_locale("en/settings/advanced.json", br#"{"settings.b":"two"}"#);
        scratch.write_locale("en/nav.json", br#"{"nav.a":"one"}"#);

        let out = scratch.expand_locales();

        let nav = scratch.included("en", "en/nav.json");
        let advanced = scratch.included("en", "en/settings/advanced.json");
        let fr = scratch.included("fr", "fr/nav.json");
        assert_eq!(out, format!("&[{nav}, {advanced}, {fr}]"));
    }

    #[test]
    fn a_folder_per_language_embeds_neither_its_lock_nor_the_notes_beside_it() {
        let scratch = Scratch::new("folder-extras");
        scratch.write_locale("en/nav.json", br#"{"nav.a":"one"}"#);
        scratch.write_locale("fr/nav.json", br#"{"nav.a":"un"}"#);
        scratch.write_locale("fr/i18n.lock", b"{}");
        scratch.write_locale("notes.json", br#"{"*":"a note"}"#);

        let out = scratch.expand_locales();

        let en = scratch.included("en", "en/nav.json");
        let fr = scratch.included("fr", "fr/nav.json");
        assert_eq!(out, format!("&[{en}, {fr}]"));
    }

    #[test]
    fn a_module_that_ships_no_catalogue_gets_an_empty_list_rather_than_an_error() {
        let scratch = Scratch::new("no-locales");

        assert_eq!(scratch.expand_locales(), "&[]");
        assert!(expansion(None).starts_with("compile_error!"));
        assert!(expansion(Some(String::new())).contains("no parent dir"));
    }
}
