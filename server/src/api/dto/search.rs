use serde::Serialize;

use crate::model::{show_card, MediaCard, MediaItem, Show};

/// One ranked result of `GET /api/search` a `type`-tagged union so the client
/// can switch on it (`movie`/`episode` carry a `MediaItem`, `show` a `Show`).
/// With `view=card` a movie or an episode is slimmed to its [`MediaCard`] and a
/// show drops its cast and crew.
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SearchHit {
    Movie { item: MediaItem },
    Show { show: Show },
    Episode { item: MediaItem },
    #[serde(rename = "movie")]
    MovieCard { item: MediaCard },
    #[serde(rename = "episode")]
    EpisodeCard { item: MediaCard },
}

impl SearchHit {
    pub fn id(&self) -> &str {
        match self {
            Self::Movie { item } | Self::Episode { item } => &item.id,
            Self::MovieCard { item } | Self::EpisodeCard { item } => &item.id,
            Self::Show { show } => &show.id,
        }
    }

    pub fn into_card(self) -> Self {
        match self {
            Self::Movie { item } => Self::MovieCard { item: item.into() },
            Self::Episode { item } => Self::EpisodeCard { item: item.into() },
            Self::Show { show } => Self::Show {
                show: show_card(show),
            },
            card => card,
        }
    }
}

impl SearchHit {
    fn title_key(&self) -> Option<(bool, u64)> {
        let (show, metadata) = match self {
            Self::Movie { item } => (false, item.metadata.as_ref()),
            Self::MovieCard { item } => (false, item.metadata.as_ref()),
            Self::Show { show } => (true, show.metadata.as_ref()),
            Self::Episode { .. } | Self::EpisodeCard { .. } => return None,
        };
        metadata.map(|m| (show, m.tmdb_id)).filter(|(_, id)| *id != 0)
    }

    fn episodes(&self) -> u32 {
        match self {
            Self::Show { show } => show.episode_count,
            _ => 0,
        }
    }
}

/// `hits` with one entry per title, in the order given.
///
/// A library can hold one title under two rows: a show whose seasons sit in
/// folders spelled two ways, a film copied into two libraries. A list of
/// answers shows it once, at the rank of the first, and for a show as the row
/// holding the most episodes.
pub fn one_per_title(hits: Vec<SearchHit>) -> Vec<SearchHit> {
    let mut place: std::collections::HashMap<(bool, u64), usize> = std::collections::HashMap::new();
    let mut out: Vec<SearchHit> = Vec::with_capacity(hits.len());
    for hit in hits {
        let Some(key) = hit.title_key() else {
            out.push(hit);
            continue;
        };
        match place.get(&key) {
            Some(&at) if hit.episodes() > out[at].episodes() => out[at] = hit,
            Some(_) => {}
            None => {
                place.insert(key, out.len());
                out.push(hit);
            }
        }
    }
    out
}

/// Somebody the catalogue credits whose name matches the query. `titles`
/// counts only what the asker may see.
#[derive(Serialize)]
pub struct PersonHit {
    pub name: String,
    #[serde(rename = "tmdbId", skip_serializing_if = "Option::is_none")]
    pub tmdb_id: Option<u64>,
    #[serde(rename = "profileUrl", skip_serializing_if = "Option::is_none")]
    pub profile_url: Option<String>,
    pub titles: usize,
}

impl From<crate::services::search::PersonHit> for PersonHit {
    fn from(hit: crate::services::search::PersonHit) -> Self {
        Self {
            name: hit.name,
            tmdb_id: hit.tmdb_id,
            profile_url: hit.profile_url,
            titles: hit.titles,
        }
    }
}

/// `GET /api/search?q=…` the echoed query plus hits in descending relevance,
/// and the people whose name it matches.
#[derive(Serialize)]
pub struct SearchResponse {
    pub query: String,
    pub results: Vec<SearchHit>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub people: Vec<PersonHit>,
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn movie(id: &str, tmdb: u64) -> SearchHit {
        SearchHit::Movie {
            item: serde_json::from_value(json!({
                "id": id, "title": "T", "kind": "movie", "year": 2020, "durationMs": 1,
                "container": "mkv", "subtitles": [], "library": "lib", "addedAt": "t",
                "metadata": { "tmdbId": tmdb, "title": "T", "overview": "O", "genres": [], "tmdbUrl": "x" },
                "files": []
            }))
            .unwrap(),
        }
    }

    fn show(id: &str, tmdb: u64, episodes: u32) -> SearchHit {
        SearchHit::Show {
            show: serde_json::from_value(json!({
                "id": id, "title": "S", "library": "lib", "seasonCount": 1,
                "episodeCount": episodes, "addedAt": "t",
                "metadata": { "tmdbId": tmdb, "title": "S", "overview": "O", "genres": [], "tmdbUrl": "x" }
            }))
            .unwrap(),
        }
    }

    fn ids(hits: &[SearchHit]) -> Vec<&str> {
        hits.iter().map(SearchHit::id).collect()
    }

    #[test]
    fn a_show_held_under_two_rows_is_listed_once_as_the_fuller_one() {
        let hits = vec![show("half", 84773, 8), movie("film", 7), show("whole", 84773, 16)];

        let listed = one_per_title(hits);

        assert_eq!(ids(&listed), ["whole", "film"]);
    }

    #[test]
    fn a_film_and_a_show_sharing_a_provider_id_are_two_titles() {
        let hits = vec![movie("film", 42), show("serie", 42, 3)];

        let listed = one_per_title(hits);

        assert_eq!(ids(&listed), ["film", "serie"]);
    }

    #[test]
    fn a_film_copied_into_two_libraries_keeps_the_first_ranked() {
        let hits = vec![movie("first", 9), movie("second", 9), movie("other", 10)];

        let listed = one_per_title(hits);

        assert_eq!(ids(&listed), ["first", "other"]);
    }
}
