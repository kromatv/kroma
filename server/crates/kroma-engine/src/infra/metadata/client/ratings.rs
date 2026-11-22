//! Every country's age rating for one title, alone: the block a detail request
//! appends, asked for by itself (ACCT-157).

use crate::domain::CountryRatings;

use super::certification::Certifications;
use super::{api, tmdb_json, Target};

/// The label every country gave the film or show `id`, one request. `None`
/// when TMDB did not answer.
pub fn ratings_by_id(api_key: &str, target: Target, id: u64) -> Option<CountryRatings> {
    let url = format!(
        "{}/{}/{id}/{}",
        api(),
        target.detail_path(),
        target.certification_append()
    );
    let block: Certifications = tmdb_json("metadata.ratings", &url, api_key, &[]).ok()?;
    Some(block.every_country())
}
