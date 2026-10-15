use super::wire::{ReleaseDatesCountry, ReleaseDatesResp};
use super::ymd;

// TMDB release types we key on for a movie's home-availability date.
const REL_THEATRICAL: u32 = 3;
const REL_DIGITAL: u32 = 4;
const REL_PHYSICAL: u32 = 5;

/// A movie's two dates that matter to a search: when it reaches homes, and when
/// it reaches cinemas.
#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct MovieDates {
    pub(super) available: Option<String>,
    pub(super) cinema: Option<String>,
}

// Availability prefers the digital release, then theatrical, then physical,
// then the basic release_date. Reads the US window (most complete for digital)
// and falls back to any country. All dates normalized to `YYYY-MM-DD`.
pub(super) fn movie_dates(rd: Option<ReleaseDatesResp>, basic: Option<&str>) -> MovieDates {
    let results = rd.map(|r| r.results).unwrap_or_default();
    let block = results
        .iter()
        .find(|c| c.iso_3166_1.as_deref() == Some("US"))
        .or_else(|| results.first());
    let basic = basic.and_then(ymd);
    let theatrical = block.and_then(|b| typed_release(b, REL_THEATRICAL));
    let available = block
        .and_then(|b| typed_release(b, REL_DIGITAL))
        .or_else(|| theatrical.clone())
        .or_else(|| block.and_then(|b| typed_release(b, REL_PHYSICAL)))
        .or_else(|| basic.clone());
    MovieDates {
        available,
        cinema: theatrical.or(basic),
    }
}

fn typed_release(block: &ReleaseDatesCountry, want: u32) -> Option<String> {
    block
        .release_dates
        .iter()
        .find(|d| d.kind == want)
        .and_then(|d| d.release_date.as_deref())
        .and_then(ymd)
}
