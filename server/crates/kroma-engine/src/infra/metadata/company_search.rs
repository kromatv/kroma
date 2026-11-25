//! The studios TMDB offers for a name being typed.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use super::client::{api, tmdb_json, IMG};
use super::MOST_OFFERED;

/// One company TMDB offers for a name being typed: its logo and the country it
/// comes from (`US`), each null when TMDB has none.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbStudio {
    pub tmdb_id: u64,
    pub name: String,
    pub logo_url: Option<String>,
    pub country: Option<String>,
}

/// The first ten companies TMDB offers for `query`, in its order. An error
/// when TMDB could not be asked. Blocking.
pub fn studios(api_key: &str, query: &str) -> Result<Vec<TmdbStudio>> {
    let params = [("query", query.to_string())];
    let url = format!("{}/search/company", api());
    let page: Page = tmdb_json("metadata.company", &url, api_key, &params)
        .map_err(|()| anyhow!("TMDB could not be asked which studios answer to {query}"))?;
    Ok(page
        .results
        .into_iter()
        .take(MOST_OFFERED)
        .map(Company::studio)
        .collect())
}

#[derive(Debug, Deserialize)]
struct Page {
    #[serde(default)]
    results: Vec<Company>,
}

#[derive(Debug, Deserialize)]
struct Company {
    id: u64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    logo_path: Option<String>,
    #[serde(default)]
    origin_country: Option<String>,
}

impl Company {
    fn studio(self) -> TmdbStudio {
        let logo = self.logo_path.filter(|path| !path.is_empty());
        TmdbStudio {
            tmdb_id: self.id,
            name: self.name,
            logo_url: logo.map(|path| format!("{IMG}/w185{path}")),
            country: self.origin_country.filter(|country| !country.is_empty()),
        }
    }
}

#[cfg(test)]
mod tests;
