//! Who TMDB knows under a name: the person written for a title that the
//! provider credits nobody under (LIB-99), and the people it offers for a name
//! being typed.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::domain::slug::{slug_eq, slugify};

use super::client::{api, tmdb_json, IMG};
use super::MOST_OFFERED;

const KNOWN_FOR_TITLES: usize = 3;

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
    let page = searched(api_key, &params)
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

/// One person TMDB offers for a name being typed: their portrait at the size a
/// cast shows it, the work they are known for (`Acting`, `Directing`) and up to
/// three of their titles.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbPerson {
    pub tmdb_id: u64,
    pub name: String,
    pub photo_url: Option<String>,
    pub department: Option<String>,
    pub known_for: Vec<String>,
}

/// The first ten people TMDB offers for `query`, in its order, asked in
/// `language`, adult performers left out. An error when TMDB could not be
/// asked. Blocking.
pub fn people(api_key: &str, language: &str, query: &str) -> Result<Vec<TmdbPerson>> {
    let params = [
        ("query", query.to_string()),
        ("include_adult", "false".to_string()),
        ("language", language.to_string()),
    ];
    let page = searched(api_key, &params)
        .map_err(|()| anyhow!("TMDB could not be asked who answers to {query}"))?;
    Ok(page
        .results
        .into_iter()
        .filter(|hit| !hit.adult)
        .take(MOST_OFFERED)
        .map(Hit::offered)
        .collect())
}

fn searched(api_key: &str, params: &[(&str, String)]) -> Result<Page, ()> {
    let url = format!("{}/search/person", api());
    tmdb_json("metadata.person", &url, api_key, params)
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
    #[serde(default)]
    adult: bool,
    #[serde(default)]
    known_for_department: Option<String>,
    #[serde(default)]
    known_for: Vec<Work>,
}

#[derive(Debug, Deserialize)]
struct Work {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

impl Hit {
    fn person(self) -> Person {
        Person {
            tmdb_id: self.id,
            profile_url: portrait(self.profile_path),
        }
    }

    fn offered(self) -> TmdbPerson {
        TmdbPerson {
            tmdb_id: self.id,
            photo_url: portrait(self.profile_path),
            department: written(self.known_for_department),
            known_for: self
                .known_for
                .into_iter()
                .filter_map(Work::titled)
                .take(KNOWN_FOR_TITLES)
                .collect(),
            name: self.name,
        }
    }
}

impl Work {
    fn titled(self) -> Option<String> {
        written(self.title).or_else(|| written(self.name))
    }
}

fn portrait(path: Option<String>) -> Option<String> {
    written(path).map(|path| format!("{IMG}/w342{path}"))
}

fn written(text: Option<String>) -> Option<String> {
    text.filter(|text| !text.is_empty())
}

#[cfg(test)]
mod tests;
