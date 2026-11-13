//! The providers the server knows by name. Each is a folder under `presets/`
//! holding a `preset.json` and its marks, gathered at build time: adding a
//! provider is adding a folder, and nothing lists them. `presets/README.md`
//! says what goes in one.
//!
//! A preset fills the admin form for its provider and says how the provider's
//! button looks. It changes nothing about how the provider is spoken to.

use std::sync::LazyLock;

use serde::Deserialize;

mod files {
    include!(concat!(env!("OUT_DIR"), "/preset_parts.rs"));
}

const MANIFEST: &str = "preset.json";
const DEFAULT_ICON: &str = "key";
const DEFAULT_GROUP_CLAIM: &str = "groups";
const DEFAULT_MARK: &str = "mark.svg";

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

/// One file the server can serve: an SVG under `<preset>/<name>`, and a
/// version that changes with its bytes, so an address that carries it can be
/// cached.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mark {
    pub name: String,
    pub svg: &'static str,
    pub version: String,
}

/// Every preset that reads cleanly, by name, with the marks they draw.
#[derive(Debug, Default)]
pub struct Catalog {
    pub presets: Vec<Preset>,
    pub marks: Vec<Mark>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    name: String,
    label: Option<String>,
    icon: Option<String>,
    issuer: String,
    #[serde(default)]
    scopes: Vec<String>,
    group_claim: Option<String>,
    console: Option<String>,
    docs: String,
    mark: Option<String>,
    brand: Option<BrandFile>,
    sources: Sources,
}

/// Where a preset's facts were read, kept beside them for whoever checks them
/// next. `mark` is asked of every preset.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Sources {
    mark: String,
    #[allow(dead_code)]
    brand: Option<String>,
    #[allow(dead_code)]
    issuer: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum BrandFile {
    Grounds { dark: LookFile, light: LookFile },
    Same(LookFile),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LookFile {
    fill: String,
    stroke: Option<String>,
    ink: String,
    mark: String,
}

fn is_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn is_colour(colour: &str) -> bool {
    colour.strip_prefix('#').is_some_and(|hex| {
        hex.len() == 6
            && hex
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}

fn is_web_address(url: &str) -> bool {
    url.strip_prefix("https://")
        .is_some_and(|rest| !rest.is_empty() && !rest.contains(char::is_whitespace))
}

/// What is wrong with `svg` as a mark, if anything. A link inside one may
/// only point at the file's own parts.
fn svg_fault(svg: &str) -> Option<&'static str> {
    let body = svg.trim_start();
    let opens = body.starts_with("<svg") || (body.starts_with("<?xml") && body.contains("<svg"));
    if !opens || !svg.trim_end().ends_with("</svg>") {
        return Some("is not one SVG");
    }
    if svg.to_ascii_lowercase().contains("<script") {
        return Some("carries a script");
    }
    let outward = svg
        .match_indices("href=")
        .any(|(at, found)| !svg[at + found.len()..].trim_start_matches(['"', '\'']).starts_with('#'));
    outward.then_some("links outside itself")
}

struct Folder<'a> {
    id: &'a str,
    files: Vec<(&'a str, &'static str)>,
}

impl Folder<'_> {
    fn file(&self, name: &str) -> Option<&'static str> {
        self.files
            .iter()
            .find(|(file, _)| *file == name)
            .map(|(_, body)| *body)
    }

    fn mark_name(&self, file: &str) -> String {
        format!("{}/{}", self.id, file.trim_end_matches(".svg"))
    }

    fn look(&self, look: LookFile) -> Result<Look, String> {
        let coloured = is_colour(&look.fill)
            && is_colour(&look.ink)
            && look.stroke.as_deref().is_none_or(is_colour);
        if !coloured {
            return Err("a colour is not six lower-case hex digits after a hash".into());
        }
        if self.file(&look.mark).is_none() {
            return Err(format!("its look names `{}`, which is not in the folder", look.mark));
        }
        Ok(Look {
            fill: look.fill,
            stroke: look.stroke,
            ink: look.ink,
            mark: self.mark_name(&look.mark),
        })
    }

    fn brand(&self, brand: BrandFile) -> Result<Brand, String> {
        match brand {
            BrandFile::Grounds { dark, light } => Ok(Brand {
                dark: self.look(dark)?,
                light: self.look(light)?,
            }),
            BrandFile::Same(look) => {
                let look = self.look(look)?;
                Ok(Brand {
                    dark: look.clone(),
                    light: look,
                })
            }
        }
    }

    fn preset(&self) -> Result<Preset, String> {
        if !is_id(self.id) {
            return Err("its folder is not named in lower-case letters, digits and dashes".into());
        }
        let manifest = self.file(MANIFEST).ok_or("it has no preset.json")?;
        let manifest: Manifest =
            serde_json::from_str(manifest).map_err(|e| format!("its preset.json does not read: {e}"))?;
        let mark = manifest.mark.unwrap_or_else(|| DEFAULT_MARK.to_string());
        if self.file(&mark).is_none() {
            return Err(format!("its mark `{mark}` is not in the folder"));
        }
        if manifest.name.trim().is_empty() || manifest.sources.mark.trim().is_empty() {
            return Err("it needs a name and the source of its mark".into());
        }
        let links = [Some(&manifest.issuer), Some(&manifest.docs), manifest.console.as_ref()];
        if !links.into_iter().flatten().all(|url| is_web_address(url)) {
            return Err("its issuer, docs and console must be https addresses".into());
        }
        Ok(Preset {
            id: self.id.to_string(),
            label: manifest.label.unwrap_or_else(|| manifest.name.clone()),
            name: manifest.name,
            icon: manifest.icon.unwrap_or_else(|| DEFAULT_ICON.to_string()),
            issuer: manifest.issuer,
            scopes: manifest.scopes,
            group_claim: manifest
                .group_claim
                .unwrap_or_else(|| DEFAULT_GROUP_CLAIM.to_string()),
            console: manifest.console,
            docs: manifest.docs,
            mark: self.mark_name(&mark),
            brand: manifest.brand.map(|brand| self.brand(brand)).transpose()?,
        })
    }

    fn marks(&self) -> Result<Vec<Mark>, String> {
        self.files
            .iter()
            .filter(|(file, _)| file.ends_with(".svg"))
            .map(|(file, svg)| match svg_fault(svg) {
                Some(fault) => Err(format!("`{file}` {fault}")),
                None => Ok(Mark {
                    name: self.mark_name(file),
                    svg,
                    version: kroma_primitives::short_hash(svg),
                }),
            })
            .collect()
    }
}

/// Reads the gathered `(folder, file, contents)` triples into a catalog, with
/// one line for each folder that does not make a preset and why.
pub fn read(files: &[(&'static str, &'static str, &'static str)]) -> (Catalog, Vec<String>) {
    let mut folders: Vec<Folder> = Vec::new();
    for (id, file, body) in files {
        match folders.last_mut().filter(|folder| folder.id == *id) {
            Some(folder) => folder.files.push((file, body)),
            None => folders.push(Folder {
                id,
                files: vec![(file, body)],
            }),
        }
    }
    let mut catalog = Catalog::default();
    let mut problems = Vec::new();
    for folder in &folders {
        match folder.preset().and_then(|preset| Ok((preset, folder.marks()?))) {
            Ok((preset, marks)) => {
                catalog.presets.push(preset);
                catalog.marks.extend(marks);
            }
            Err(why) => problems.push(format!("preset `{}`: {why}", folder.id)),
        }
    }
    catalog
        .presets
        .sort_by_key(|preset| preset.name.to_lowercase());
    (catalog, problems)
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

/// The mark filed under `name` (`<preset>/<file>`, without `.svg`), or `None`
/// when the server has no such file.
pub fn mark(name: &str) -> Option<&'static Mark> {
    CATALOG.marks.iter().find(|mark| mark.name == name)
}

#[cfg(test)]
mod tests;
