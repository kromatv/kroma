//! Shared `#[cfg(test)]` builders for the hero tests: hand-built metadata and
//! candidates plus the fixed clock the scoring assertions reason
//! against. One copy, so `score` and the orchestrator test the same shapes.

use crate::db::HeroCandidate;
use crate::model::Metadata;
use crate::state::SharedState;

/// Fixed "now" for the scoring tests (no wall clock in an assertion).
pub(super) const NOW_MS: i64 = 1_700_000_000_000;

/// Metadata carrying just the fields the hero gates and scores on.
pub(super) fn meta(rating: Option<f32>, backdrop: bool, overview: bool) -> Metadata {
    Metadata {
        provider: "tmdb",
        tmdb_id: 1,
        imdb_id: None,
        title: None,
        tagline: None,
        overview: overview.then(|| "An epic.".to_string()),
        release_date: None,
        genres: Vec::new(),
        tmdb_genre_ids: Vec::new(),
        rating,
        certification: None,
        poster_url: None,
        backdrop_url: backdrop.then(|| "https://img/b.jpg".to_string()),
        logo_url: None,
        theme_url: None,
        cast: Vec::new(),
        crew: Vec::new(),
        keywords: Vec::new(),
        tvdb_id: None,
        tmdb_url: String::new(),
    }
}

/// An RFC3339 stamp `ms_ago` before [`NOW_MS`] (negative = a future stamp).
pub(super) fn iso(ms_ago: i64) -> String {
    let ts = time::OffsetDateTime::from_unix_timestamp((NOW_MS - ms_ago) / 1000).unwrap();
    ts.format(&time::format_description::well_known::Rfc3339)
        .unwrap()
}

/// A candidate with nothing to score: no art, no synopsis, unrated, no stream.
pub(super) fn candidate(id: &str) -> HeroCandidate {
    HeroCandidate {
        id: id.into(),
        added_at: "t".into(),
        has_backdrop: false,
        has_overview: false,
        rating: None,
        width: 0,
        hdr: false,
    }
}

/// A [`candidate`] with the art and synopsis the hero needs to render.
pub(super) fn shown(id: &str) -> HeroCandidate {
    HeroCandidate {
        has_backdrop: true,
        has_overview: true,
        ..candidate(id)
    }
}

/// Insert a user row: `watched` and `progress` both have an FK on `users`, so a
/// history marker needs one to exist. Test-controlled literal id, inlined like
/// the other section tests (kroma-engine has no direct rusqlite dependency).
pub(super) fn seed_user(state: &SharedState, id: &str) {
    state
        .db
        .get()
        .unwrap()
        .execute(
            &format!(
                "INSERT OR IGNORE INTO users (id,email,username,password_hash,avatar_url,permissions,created_at) \
                 VALUES ('{id}','{id}@x','{id}','h',NULL,'[]','t')"
            ),
            [],
        )
        .unwrap();
}
