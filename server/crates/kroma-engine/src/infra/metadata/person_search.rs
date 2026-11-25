//! Who TMDB knows under a name, for a person written for a title that the
//! provider credits nobody under (LIB-99).

use anyhow::{anyhow, Result};
use serde::Deserialize;

use crate::domain::slug::{slug_eq, slugify};

use super::client::{api, tmdb_json, IMG};

/// One person TMDB knows: their id, and their portrait at the size a cast
/// shows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Person {
    pub tmdb_id: u64,
    pub profile_url: Option<String>,
}

/// The best known person TMDB has under `name` exactly, accents, case and
/// punctuation aside, or `None` when it has nobody of that name. An error when
/// TMDB could not be asked. Blocking.
pub fn named(api_key: &str, name: &str) -> Result<Option<Person>> {
    let params = [
        ("query", name.to_string()),
        ("include_adult", "false".to_string()),
    ];
    let url = format!("{}/search/person", api());
    let page: Page = tmdb_json("metadata.person", &url, api_key, &params)
        .map_err(|()| anyhow!("TMDB could not be asked who {name} is"))?;
    let want = slugify(name);
    let same = page
        .results
        .into_iter()
        .filter(|hit| slug_eq(&hit.name, &want));
    Ok(same
        .max_by(|a, b| a.popularity.total_cmp(&b.popularity))
        .map(Hit::person))
}

#[derive(Debug, Deserialize)]
struct Page {
    #[serde(default)]
    results: Vec<Hit>,
}

#[derive(Debug, Deserialize)]
struct Hit {
    id: u64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    popularity: f64,
    #[serde(default)]
    profile_path: Option<String>,
}

impl Hit {
    fn person(self) -> Person {
        let path = self.profile_path.filter(|path| !path.is_empty());
        Person {
            tmdb_id: self.id,
            profile_url: path.map(|path| format!("{IMG}/w342{path}")),
        }
    }
}

#[cfg(test)]
mod tests;
