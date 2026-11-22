//! What the gates weigh a title by, asked for by itself: every country's age
//! rating and the title's genres (ACCT-157, ACCT-183).

use crate::domain::CountryRatings;

use super::details_json::Details;
use super::{Target, api, tmdb_json};

/// Every country's label for a title, and its genres in the language they
/// were asked in, names and TMDB ids aligned by index.
#[derive(Debug, Default)]
pub struct TitleFacts {
    pub ratings: CountryRatings,
    pub genres: Vec<String>,
    pub genre_ids: Vec<u32>,
}

/// [`TitleFacts`] for the film or show `id`, genres named in `language`, in
/// one request. `None` when TMDB did not answer.
pub fn facts_by_id(
    api_key: &str,
    target: Target,
    (id, language): (u64, &str),
) -> Option<TitleFacts> {
    let url = format!("{}/{}/{id}", api(), target.detail_path());
    let params = [
        ("language", language.to_string()),
        (
            "append_to_response",
            target.certification_append().to_string(),
        ),
    ];
    let details: Details = tmdb_json("metadata.ratings", &url, api_key, &params).ok()?;
    let ratings = details
        .release_dates
        .or(details.content_ratings)
        .map(|block| block.every_country())
        .unwrap_or_default();
    Some(TitleFacts {
        ratings,
        genre_ids: details.genres.iter().map(|genre| genre.id).collect(),
        genres: details.genres.into_iter().map(|genre| genre.name).collect(),
    })
}
