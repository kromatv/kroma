use serde_json::{Value, json};

use crate::{Params, ParsedRelease, Reject, Target};

pub(crate) fn reject(
    rule: &str,
    note: impl Into<String>,
    params: impl IntoIterator<Item = (&'static str, Value)>,
) -> Reject {
    Reject {
        rule: rule.into(),
        note: note.into(),
        params: params
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect::<Params>(),
    }
}

fn shape_of(parsed: &ParsedRelease) -> &'static str {
    match (parsed.full_season, parsed.season, parsed.episode) {
        (true, _, _) => "season",
        (_, Some(_), Some(_)) => "episode",
        _ => "none",
    }
}

/// Refuses a release that does not hold what the target asks for. These are
/// facts, not taste, so no rule an admin writes can override them.
pub(crate) fn check_shape(parsed: &ParsedRelease, target: &Target) -> Result<(), Reject> {
    match *target {
        Target::Movie { year } => movie_shape(parsed, year),
        Target::Episode { season, episode } => episode_shape(parsed, season, episode),
        Target::Season { season, .. } => season_shape(parsed, season),
    }
}

fn movie_shape(parsed: &ParsedRelease, year: Option<u32>) -> Result<(), Reject> {
    if parsed.season.is_some() || parsed.episode.is_some() || parsed.full_season {
        return Err(reject(
            "wrong-shape",
            "TV markers in a movie search",
            [
                ("wanted", json!("movie")),
                ("found", json!(shape_of(parsed))),
            ],
        ));
    }
    if let (Some(want), Some(got)) = (year, parsed.year) {
        if got.abs_diff(want) > 1 {
            return Err(reject(
                "wrong-year",
                format!("{got} vs {want}"),
                [("year", json!(got)), ("wantedYear", json!(want))],
            ));
        }
    }
    Ok(())
}

fn episode_shape(parsed: &ParsedRelease, season: u32, episode: u32) -> Result<(), Reject> {
    if parsed.full_season {
        return Err(reject(
            "wrong-shape",
            "season pack for a single-episode search",
            [("wanted", json!("episode")), ("found", json!("season"))],
        ));
    }
    let (Some(s), Some(e)) = (parsed.season, parsed.episode) else {
        return Err(reject(
            "wrong-shape",
            "no SxxEyy marker",
            [("wanted", json!("episode")), ("found", json!("none"))],
        ));
    };
    let span_ok = e == episode
        || parsed
            .episode_end
            .is_some_and(|end| (e..=end).contains(&episode));
    if s != season || !span_ok {
        return Err(reject(
            "wrong-episode",
            format!("S{s:02}E{e:02} vs S{season:02}E{episode:02}"),
            [
                ("season", json!(s)),
                ("episode", json!(e)),
                ("wantedSeason", json!(season)),
                ("wantedEpisode", json!(episode)),
            ],
        ));
    }
    Ok(())
}

fn season_shape(parsed: &ParsedRelease, season: u32) -> Result<(), Reject> {
    if !parsed.full_season {
        return Err(reject(
            "wrong-shape",
            "not a season pack",
            [
                ("wanted", json!("season")),
                ("found", json!(shape_of(parsed))),
            ],
        ));
    }
    if parsed.season != Some(season) {
        return Err(reject(
            "wrong-season",
            format!("{:?} vs {season}", parsed.season),
            [
                ("season", json!(parsed.season)),
                ("wantedSeason", json!(season)),
            ],
        ));
    }
    Ok(())
}
