//! The license notices of every third-party crate a program links, read at
//! build time from `cargo metadata` and the crates' own license files, and
//! written as the JSON the server serves at `GET /api/licenses`.

mod build_script;
mod files;
mod manifest;
mod metadata;
mod spdx;

use std::fmt;

pub use build_script::emit;
pub use manifest::{Entry, Manifest, Notice};
pub use metadata::{Metadata, Package};

/// Why the notices could not be read.
#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    Cargo(String),
    Json(serde_json::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(err) => write!(f, "cargo could not run: {err}"),
            Self::Cargo(stderr) => write!(f, "cargo metadata failed: {}", stderr.trim()),
            Self::Json(err) => write!(f, "cargo metadata answered unreadable JSON: {err}"),
        }
    }
}

impl std::error::Error for Error {}

/// The notices, and the crates for which no text was found.
#[derive(Debug)]
pub struct Collected {
    pub manifest: Manifest,
    pub unresolved: Vec<String>,
}

/// Every crate the root links with its texts: its own license files, else
/// those of a crate from the same repository under the same license, else
/// the SPDX texts of the license it declares.
pub fn notices(metadata: &Metadata) -> Collected {
    let mut unresolved = Vec::new();
    let notices: Vec<Notice> = metadata
        .linked()
        .into_iter()
        .map(|pkg| {
            let texts = texts_of(pkg, &metadata.packages);
            if texts.is_empty() {
                unresolved.push(format!("{} {}", pkg.name, pkg.version));
            }
            Notice {
                name: pkg.name.clone(),
                version: pkg.version.clone(),
                license: pkg.license.clone(),
                source: source_of(pkg),
                texts,
            }
        })
        .collect();
    Collected { manifest: Manifest::from(notices), unresolved }
}

fn texts_of(pkg: &Package, all: &[Package]) -> Vec<String> {
    let own = files::notice_texts(pkg);
    if !own.is_empty() {
        return own;
    }
    sibling_texts(pkg, all)
        .or_else(|| pkg.license.as_deref().and_then(|license| spdx::texts(license, &pkg.authors)))
        .unwrap_or_default()
}

fn sibling_texts(pkg: &Package, all: &[Package]) -> Option<Vec<String>> {
    let key = pkg.repository.as_deref().map(repository_key)?;
    all.iter()
        .filter(|other| other.id != pkg.id && other.license == pkg.license)
        .filter(|other| other.repository.as_deref().map(repository_key).as_ref() == Some(&key))
        .map(files::notice_texts)
        .find(|texts| !texts.is_empty())
}

fn repository_key(url: &str) -> String {
    let lower = url.trim().to_ascii_lowercase();
    let bare = lower.trim_end_matches('/').trim_end_matches(".git");
    match bare.strip_prefix("https://github.com/") {
        Some(path) => path.split('/').take(2).collect::<Vec<_>>().join("/"),
        None => bare.to_owned(),
    }
}

fn source_of(pkg: &Package) -> Option<String> {
    [&pkg.repository, &pkg.homepage]
        .into_iter()
        .flatten()
        .find(|url| url.starts_with("https://") || url.starts_with("http://"))
        .cloned()
}

#[cfg(test)]
mod tests;
