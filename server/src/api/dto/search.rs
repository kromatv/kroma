use serde::Serialize;

use crate::model::{MediaItem, Show};

/// One ranked result of `GET /api/search` a `type`-tagged union so the client
/// can switch on it (`movie`/`episode` carry a `MediaItem`, `show` a `Show`).
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SearchHit {
    Movie { item: MediaItem },
    Show { show: Show },
    Episode { item: MediaItem },
}

/// `GET /api/search?q=…` the echoed query plus hits in descending relevance.
#[derive(Serialize)]
pub struct SearchResponse {
    pub query: String,
    pub results: Vec<SearchHit>,
}

/// `GET /api/people?name=…` every movie + show one person is credited in (cast
/// or key crew), best-known work first. Reuses [`SearchHit`] so clients render the
/// results with their existing card UI. `name` comes back as the library's own
/// spelling of whoever the lookup resolved to; on a miss it is the lookup,
/// echoed.
#[derive(Serialize)]
pub struct PersonResponse {
    pub name: String,
    pub results: Vec<SearchHit>,
}

/// `GET /api/people/details?name=…` the person behind a credit, from the
/// metadata provider. `person` is `null` whenever the provider has nothing (no
/// key, unknown name, provider down): the page renders the filmography either
/// way, so this is a soft miss, never an error. `credits` carries the TMDB
/// combined filmography so the page can show titles not in the local library.
#[derive(Serialize)]
pub struct PersonDetailResponse {
    pub name: String,
    pub person: Option<crate::model::PersonDetail>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub credits: Vec<crate::infra::metadata::person::TmdbCredit>,
}
