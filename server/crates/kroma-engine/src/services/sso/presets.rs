//! The providers the server knows by name. Each is a folder under `presets/`
//! holding a `preset.json` and its marks, gathered at build time: adding a
//! provider is adding a folder, and nothing lists them. `presets/README.md`
//! says what goes in one.
//!
//! A preset fills the admin form for its provider and says how the provider's
//! button looks. It changes nothing about how the provider is spoken to.

use std::sync::LazyLock;

mod files {
    include!(concat!(env!("OUT_DIR"), "/preset_parts.rs"));
}
mod folder;

pub use folder::read;

/// How one button is painted: its fill, its edge when the provider draws one,
/// the ink of its label, and the name of the mark that sits on the fill.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Look {
    pub fill: String,
    pub stroke: Option<String>,
    pub ink: String,
    pub mark: String,
}

/// A button's look on a dark ground and on a light one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Brand {
    pub dark: Look,
    pub light: Look,
}

/// One provider the server knows by name: what its form starts with, where
/// its owner has an application made and explains how, and what its button
/// wears. `mark` is drawn where no button is, on a white tile. A preset with
/// no `brand` has a button that looks like the others on the screen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub label: String,
    pub icon: String,
    pub issuer: String,
    pub scopes: Vec<String>,
    pub group_claim: String,
    pub console: Option<String>,
    pub docs: String,
    pub mark: String,
    pub brand: Option<Brand>,
}

/// One file the server can serve: a mark named `<preset>/<file>`, the media
/// type it is sent as, and a version that changes with its bytes, so an
/// address that carries it can be cached.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mark {
    pub name: String,
    pub body: &'static [u8],
    pub media: &'static str,
    pub version: String,
}

/// Every preset that reads cleanly, by name, with the marks they draw.
#[derive(Debug, Default)]
pub struct Catalog {
    pub presets: Vec<Preset>,
    pub marks: Vec<Mark>,
}

static CATALOG: LazyLock<Catalog> = LazyLock::new(|| {
    let (catalog, problems) = read(files::PRESET_FILES);
    for problem in problems {
        tracing::error!("{problem}");
    }
    catalog
});

/// Every preset, by name.
pub fn presets() -> &'static [Preset] {
    &CATALOG.presets
}

/// The preset `id` names, or `None` for a provider the server does not know
/// by name.
pub fn preset(id: &str) -> Option<&'static Preset> {
    CATALOG.presets.iter().find(|preset| preset.id == id)
}

/// The mark filed under `name` (`<preset>/<file>`), or `None` when the server
/// has no such file.
pub fn mark(name: &str) -> Option<&'static Mark> {
    CATALOG.marks.iter().find(|mark| mark.name == name)
}

#[cfg(test)]
mod tests;
