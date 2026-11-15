//! One preset folder read into a preset and its marks, and what is wrong with
//! a folder that does not make one.

use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::{Brand, Catalog, Look, Mark, Preset};

pub(super) const MANIFEST: &str = "preset.json";
const DEFAULT_ICON: &str = "key";
const DEFAULT_GROUP_CLAIM: &str = "groups";
const DEFAULT_MARK: &str = "mark.svg";
const SVG: &str = "image/svg+xml";
const PNG: &str = "image/png";
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

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

pub(super) fn svg_fault(svg: &str) -> Option<&'static str> {
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

fn media_of(file: &str) -> Option<&'static str> {
    match file.rsplit_once('.')?.1 {
        "svg" => Some(SVG),
        "png" => Some(PNG),
        _ => None,
    }
}

fn mark_fault(media: &str, body: &[u8]) -> Option<&'static str> {
    if media == PNG {
        return (!body.starts_with(PNG_SIGNATURE)).then_some("is not a PNG");
    }
    match std::str::from_utf8(body) {
        Ok(svg) => svg_fault(svg),
        Err(_) => Some("is not one SVG"),
    }
}

struct Folder<'a> {
    id: &'a str,
    files: Vec<(&'a str, &'static [u8])>,
}

impl Folder<'_> {
    fn file(&self, name: &str) -> Option<&'static [u8]> {
        self.files
            .iter()
            .find(|(file, _)| *file == name)
            .map(|(_, body)| *body)
    }

    fn mark_name(&self, file: &str) -> String {
        format!("{}/{file}", self.id)
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
            serde_json::from_slice(manifest).map_err(|e| format!("its preset.json does not read: {e}"))?;
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
            .filter_map(|(file, body)| Some((file, *body, media_of(file)?)))
            .map(|(file, body, media)| match mark_fault(media, body) {
                Some(fault) => Err(format!("`{file}` {fault}")),
                None => Ok(Mark {
                    name: self.mark_name(file),
                    body,
                    media,
                    version: hex::encode(Sha256::digest(body))[..16].to_string(),
                }),
            })
            .collect()
    }
}

/// Reads the gathered `(folder, file, contents)` triples into a catalog, with
/// one line for each folder that does not make a preset and why.
pub fn read(files: &[(&'static str, &'static str, &'static [u8])]) -> (Catalog, Vec<String>) {
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
