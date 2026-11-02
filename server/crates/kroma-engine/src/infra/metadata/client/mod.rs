//! TMDB HTTP client: search for the best match, fetch its details + external
//! IDs / credits / images through [`kroma_http::Fetch`], and map the JSON into
//! a [`Metadata`].

mod certification;
mod details;
mod details_json;
mod lookup;

pub use lookup::{lookup, lookup_all, lookup_all_by_id};
pub(super) use kroma_requests::tmdb::{api, tmdb_json, IMG};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    Movie,
    Tv,
}

impl Target {
    pub(super) fn search_path(self) -> &'static str {
        match self {
            Target::Movie => "search/movie",
            Target::Tv => "search/tv",
        }
    }
    fn detail_path(self) -> &'static str {
        match self {
            Target::Movie => "movie",
            Target::Tv => "tv",
        }
    }
    /// TMDB uses a different year query param for movies vs. shows.
    /// `primary_release_year` is the precise movie filter Seerr/Overseerr use.
    pub(super) fn year_param(self) -> &'static str {
        match self {
            Target::Movie => "primary_release_year",
            Target::Tv => "first_air_date_year",
        }
    }
    fn web_kind(self) -> &'static str {
        self.detail_path()
    }
    fn certification_append(self) -> &'static str {
        match self {
            Target::Movie => "release_dates",
            Target::Tv => "content_ratings",
        }
    }
}

const MAX_CAST: usize = 12;
const MAX_CREW: usize = 8;

// TMDB returns keywords unordered; this bounds how much feeds the embedding doc.
const MAX_KEYWORDS: usize = 20;

#[cfg(test)]
mod tests;
