use crate::{ParsedRelease, Reject, Target};

pub(crate) fn reject(rule: &str, note: impl Into<String>) -> Reject {
    Reject {
        rule: rule.into(),
        note: note.into(),
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
        return Err(reject("wrong-shape", "TV markers in a movie search"));
    }
    if let (Some(want), Some(got)) = (year, parsed.year) {
        if got.abs_diff(want) > 1 {
            return Err(reject("wrong-year", format!("{got} vs {want}")));
        }
    }
    Ok(())
}

fn episode_shape(parsed: &ParsedRelease, season: u32, episode: u32) -> Result<(), Reject> {
    if parsed.full_season {
        return Err(reject(
            "wrong-shape",
            "season pack for a single-episode search",
        ));
    }
    let (Some(s), Some(e)) = (parsed.season, parsed.episode) else {
        return Err(reject("wrong-shape", "no SxxEyy marker"));
    };
    let span_ok = e == episode
        || parsed
            .episode_end
            .is_some_and(|end| (e..=end).contains(&episode));
    if s != season || !span_ok {
        return Err(reject(
            "wrong-episode",
            format!("S{s:02}E{e:02} vs S{season:02}E{episode:02}"),
        ));
    }
    Ok(())
}

fn season_shape(parsed: &ParsedRelease, season: u32) -> Result<(), Reject> {
    if !parsed.full_season {
        return Err(reject("wrong-shape", "not a season pack"));
    }
    if parsed.season != Some(season) {
        return Err(reject(
            "wrong-season",
            format!("{:?} vs {season}", parsed.season),
        ));
    }
    Ok(())
}
