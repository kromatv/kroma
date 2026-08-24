//! Resolved provider metadata entities (TMDB), part of the wire contract shared
//! with web/TV clients. The HTTP client that produces them lives in
//! `crate::infra::metadata`.

use serde::{Deserialize, Serialize};

/// Provider metadata for one movie or show. Serialized to clients and
/// round-tripped through the DB's `metadata` JSON column (hence `Deserialize`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metadata {
    // Always "tmdb"; a `&'static str` cannot be deserialized into.
    #[serde(skip_deserializing, default = "default_provider")]
    pub provider: &'static str,
    #[serde(rename = "tmdbId")]
    pub tmdb_id: u64,
    #[serde(rename = "imdbId", skip_serializing_if = "Option::is_none")]
    pub imdb_id: Option<String>,
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tagline: Option<String>,
    pub overview: Option<String>,
    #[serde(rename = "releaseDate", skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    pub genres: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<f32>,
    #[serde(rename = "posterUrl", skip_serializing_if = "Option::is_none")]
    pub poster_url: Option<String>,
    #[serde(rename = "backdropUrl", skip_serializing_if = "Option::is_none")]
    pub backdrop_url: Option<String>,
    #[serde(rename = "logoUrl", skip_serializing_if = "Option::is_none")]
    pub logo_url: Option<String>,
    // A local path, not a provider URL. TV shows only.
    #[serde(rename = "themeUrl", default, skip_serializing_if = "Option::is_none")]
    pub theme_url: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cast: Vec<CastMember>,
    // Directors first, then writers; TV creators folded in.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub crew: Vec<CrewMember>,
    // Internal: consumed by `build_doc` during enrichment, never persisted.
    #[serde(default, skip_serializing)]
    pub keywords: Vec<String>,
    // Internal: looks up the theme song, then dropped.
    #[serde(default, skip_serializing)]
    pub tvdb_id: Option<u64>,
    #[serde(rename = "tmdbUrl")]
    pub tmdb_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CastMember {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character: Option<String>,
    // A TMDB URL until `crate::image::localize` rewrites it to a local path.
    #[serde(
        rename = "profileUrl",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub profile_url: Option<String>,
}

/// `job` is the TMDB job title (`"Director"`, `"Writer"`, `"Creator"`, …).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrewMember {
    pub name: String,
    pub job: String,
    #[serde(
        rename = "profileUrl",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub profile_url: Option<String>,
}

/// Not stored with a title's metadata: a person is not a library entity, so
/// this is resolved on demand and cached in memory.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PersonDetail {
    #[serde(rename = "tmdbId")]
    pub tmdb_id: u64,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub biography: Option<String>,
    // `YYYY-MM-DD`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub birthday: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deathday: Option<String>,
    #[serde(rename = "placeOfBirth", skip_serializing_if = "Option::is_none")]
    pub place_of_birth: Option<String>,
    // TMDB's `known_for_department` (`"Acting"`, …), translated client-side.
    #[serde(rename = "knownFor", skip_serializing_if = "Option::is_none")]
    pub known_for: Option<String>,
    #[serde(rename = "profileUrl", skip_serializing_if = "Option::is_none")]
    pub profile_url: Option<String>,
    #[serde(rename = "tmdbUrl")]
    pub tmdb_url: String,
}

fn default_provider() -> &'static str {
    "tmdb"
}

/// The text embedded for one title. Ordered most- to least-discriminating so a
/// truncating tokenizer keeps the important parts.
pub fn build_doc(title: &str, year: Option<u32>, meta: &Metadata) -> String {
    let mut parts: Vec<String> = Vec::with_capacity(8);
    parts.push(title.to_string());
    if let Some(y) = year {
        parts.push(y.to_string());
    }
    if !meta.genres.is_empty() {
        let genres = meta.genres.join(" ");
        parts.push(genres.clone()); // repeat: genres dominate similarity
        parts.push(genres);
    }
    if !meta.keywords.is_empty() {
        parts.push(meta.keywords.join(" "));
    }
    for c in meta.cast.iter().take(6) {
        parts.push(c.name.clone());
    }
    if let Some(tagline) = &meta.tagline {
        parts.push(tagline.clone());
    }
    if let Some(overview) = &meta.overview {
        parts.push(overview.clone());
    }
    parts.join(". ")
}

/// One TMDB title offered by the "fix the match" picker, with the confidence
/// [`crate::matching`] gives it against what the filename parsed to.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchCandidate {
    pub tmdb_id: u64,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    pub overview: Option<String>,
    pub rating: Option<f32>,
    // Confidence in `0.0..=1.0` that this is the title on disk.
    pub score: f32,
    pub current: bool,
}

/// `GET /api/rematch/{kind}/{id}/candidates`: what was matched against, and the
/// ranked candidates to choose from.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchCandidates {
    // The operator's query if they typed one, else the parsed filename title.
    pub query: String,
    // Parsed from the filename; what scoring compares against.
    pub year: Option<u32>,
    pub current_tmdb_id: Option<u64>,
    // The current match was chosen by an operator, not resolved automatically.
    pub pinned: bool,
    pub results: Vec<MatchCandidate>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cast(name: &str) -> CastMember {
        CastMember {
            name: name.into(),
            character: None,
            profile_url: None,
        }
    }

    fn metadata() -> Metadata {
        Metadata {
            provider: default_provider(),
            tmdb_id: 603,
            imdb_id: None,
            title: Some("The Matrix".into()),
            tagline: None,
            overview: None,
            release_date: None,
            genres: Vec::new(),
            rating: None,
            poster_url: None,
            backdrop_url: None,
            logo_url: None,
            theme_url: None,
            cast: Vec::new(),
            crew: Vec::new(),
            keywords: Vec::new(),
            tvdb_id: None,
            tmdb_url: "https://themoviedb.org/movie/603".into(),
        }
    }

    #[test]
    fn the_embedded_doc_carries_every_discriminating_field_in_order() {
        let meta = Metadata {
            genres: vec!["Science Fiction".into(), "Action".into()],
            keywords: vec!["dystopia".into(), "simulation".into()],
            cast: vec![cast("Keanu Reeves"), cast("Carrie-Anne Moss")],
            tagline: Some("Welcome to the Real World".into()),
            overview: Some("A hacker learns the truth.".into()),
            ..metadata()
        };
        assert_eq!(
            build_doc("The Matrix", Some(1999), &meta),
            "The Matrix. 1999. \
             Science Fiction Action. Science Fiction Action. \
             dystopia simulation. \
             Keanu Reeves. Carrie-Anne Moss. \
             Welcome to the Real World. \
             A hacker learns the truth."
        );
    }

    #[test]
    fn the_embedded_doc_keeps_only_the_first_six_cast_members() {
        let meta = Metadata {
            cast: (1..=8).map(|n| cast(&format!("Actor {n}"))).collect(),
            ..metadata()
        };
        let doc = build_doc("Ensemble", None, &meta);
        assert!(doc.contains("Actor 6"), "{doc}");
        assert!(!doc.contains("Actor 7"), "{doc}");
    }

    #[test]
    fn an_empty_metadata_embeds_as_the_title_alone() {
        assert_eq!(build_doc("Untitled", None, &metadata()), "Untitled");
    }
}
