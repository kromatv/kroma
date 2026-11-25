use std::fs;
use std::path::Path;

use crate::metadata::Package;

const STEMS: [&str; 4] = ["license", "licence", "copying", "notice"];

fn is_notice(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    STEMS.iter().any(|stem| {
        lower.strip_prefix(stem).is_some_and(|rest| {
            rest.is_empty() || rest.starts_with(['.', '-', '_'])
        })
    })
}

fn read(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// The license and notice files at the top of a package's folder, in name
/// order, then the `license-file` its manifest names when it lives elsewhere.
pub fn notice_texts(pkg: &Package) -> Vec<String> {
    let Some(dir) = pkg.manifest_path.parent() else {
        return Vec::new();
    };
    let mut names: Vec<String> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| is_notice(name))
        .collect();
    names.sort();
    if let Some(named) = pkg.license_file.as_deref().filter(|named| !names.iter().any(|n| n == named)) {
        names.push(named.to_owned());
    }
    names.iter().filter_map(|name| read(&dir.join(name))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn package(dir: &Path, license_file: Option<&str>) -> Package {
        Package {
            id: "id".into(),
            name: "crate".into(),
            version: "1.0.0".into(),
            license: Some("MIT".into()),
            license_file: license_file.map(Into::into),
            repository: None,
            homepage: None,
            authors: Vec::new(),
            manifest_path: dir.join("Cargo.toml"),
            source: Some("registry".into()),
        }
    }

    #[test]
    fn recognises_license_copying_and_notice_files() {
        let names = ["LICENSE", "LICENSE-MIT", "licence.txt", "COPYING", "NOTICE.md", "UNLICENSE", "LICENSES"];

        let matched: Vec<bool> = names.iter().map(|name| is_notice(name)).collect();

        assert_eq!(matched, vec![true, true, true, true, true, false, false]);
    }

    #[test]
    fn reads_every_notice_file_in_name_order() {
        let dir = kroma_testing::temp_dir("notices-files");
        fs::write(dir.path().join("LICENSE-MIT"), "MIT text\n").unwrap();
        fs::write(dir.path().join("LICENSE-APACHE"), "Apache text").unwrap();
        fs::write(dir.path().join("README.md"), "readme").unwrap();
        fs::write(dir.path().join("NOTICE"), "  \n").unwrap();

        let texts = notice_texts(&package(dir.path(), None));

        assert_eq!(texts, vec!["Apache text", "MIT text"]);
    }

    #[test]
    fn adds_the_license_file_the_manifest_names() {
        let dir = kroma_testing::temp_dir("notices-license-file");
        fs::create_dir(dir.path().join("legal")).unwrap();
        fs::write(dir.path().join("legal/terms.txt"), "Terms").unwrap();

        let texts = notice_texts(&package(dir.path(), Some("legal/terms.txt")));

        assert_eq!(texts, vec!["Terms"]);
    }

    #[test]
    fn reads_nothing_from_a_missing_folder() {
        let pkg = package(Path::new("/nonexistent/crate"), None);

        let texts = notice_texts(&pkg);

        assert!(texts.is_empty());
    }
}
