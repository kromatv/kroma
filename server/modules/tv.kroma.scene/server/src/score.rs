//! The decision engine: deterministic, explainable scoring of a parsed release
//! against a target + quality profile. Hard rejects first (each with the rule
//! that fired), then additive score lines the caller persists with the grab.

use crate::{Candidate, Codec, ParsedRelease, Profile, Reject, Res, ScoreLine, Scored, Source, Target};

fn reject(rule: &str, note: impl Into<String>) -> Reject {
    Reject { rule: rule.into(), note: note.into() }
}

// Case-insensitive token match of `needle` against the release title.
fn has_token(title: &str, needle: &str) -> bool {
    let needle = needle.trim().to_ascii_lowercase();
    !needle.is_empty()
        && title
            .split(['.', ' ', '_', '-', '[', ']', '(', ')'])
            .any(|t| t.eq_ignore_ascii_case(&needle))
}

pub fn score(
    parsed: &ParsedRelease,
    candidate: &Candidate,
    target: &Target,
    profile: &Profile,
    release_title: &str,
) -> Result<Scored, Reject> {
    reject_keywords(profile, release_title)?;
    if parsed.source == Some(Source::Cam) {
        return Err(reject("cam-source", "cam/telesync/screener release"));
    }
    if matches!(parsed.codec, Some(Codec::Xvid)) {
        return Err(reject("legacy-codec", "Xvid/DivX"));
    }
    let seeders = candidate.seeders.unwrap_or(0);
    if seeders < profile.min_seeders {
        return Err(reject("seeders", format!("{seeders} < {}", profile.min_seeders)));
    }
    let Some(resolution) = parsed.resolution else {
        return Err(reject("resolution", "no recognizable resolution"));
    };

    // Target shape checks + the size budget for this kind of grab.
    let max_size = target_budget(parsed, target, profile)?;
    if max_size > 0 {
        if let Some(size) = candidate.size_bytes {
            if size > max_size {
                return Err(reject("too-big", format!("{} > {}", gb(size), gb(max_size))));
            }
        }
    }

    let lines = score_lines(parsed, candidate, target, profile, resolution, max_size, seeders);
    Ok(Scored { parsed: parsed.clone(), score: lines.iter().map(|l| l.delta).sum(), breakdown: lines })
}

fn reject_keywords(profile: &Profile, release_title: &str) -> Result<(), Reject> {
    for kw in &profile.forbidden_keywords {
        if has_token(release_title, kw) {
            return Err(reject("forbidden-keyword", kw.clone()));
        }
    }
    for kw in &profile.required_keywords {
        if !has_token(release_title, kw) {
            return Err(reject("missing-required-keyword", kw.clone()));
        }
    }
    Ok(())
}

fn target_budget(parsed: &ParsedRelease, target: &Target, profile: &Profile) -> Result<u64, Reject> {
    match *target {
        Target::Movie { year } => movie_budget(parsed, year, profile),
        Target::Episode { season, episode } => episode_budget(parsed, season, episode, profile),
        Target::Season { season, episodes } => season_budget(parsed, season, episodes, profile),
    }
}

fn movie_budget(parsed: &ParsedRelease, year: Option<u32>, profile: &Profile) -> Result<u64, Reject> {
    if parsed.season.is_some() || parsed.episode.is_some() || parsed.full_season {
        return Err(reject("wrong-shape", "TV markers in a movie search"));
    }
    if let (Some(want), Some(got)) = (year, parsed.year) {
        if got.abs_diff(want) > 1 {
            return Err(reject("wrong-year", format!("{got} vs {want}")));
        }
    }
    Ok(profile.max_size_bytes_movie)
}

fn episode_budget(
    parsed: &ParsedRelease,
    season: u32,
    episode: u32,
    profile: &Profile,
) -> Result<u64, Reject> {
    if parsed.full_season {
        return Err(reject("wrong-shape", "season pack for a single-episode search"));
    }
    let (Some(s), Some(e)) = (parsed.season, parsed.episode) else {
        return Err(reject("wrong-shape", "no SxxEyy marker"));
    };
    let span_ok =
        e == episode || parsed.episode_end.is_some_and(|end| (e..=end).contains(&episode));
    if s != season || !span_ok {
        return Err(reject("wrong-episode", format!("S{s:02}E{e:02} vs S{season:02}E{episode:02}")));
    }
    Ok(profile.max_size_bytes_episode)
}

fn season_budget(
    parsed: &ParsedRelease,
    season: u32,
    episodes: u32,
    profile: &Profile,
) -> Result<u64, Reject> {
    if !parsed.full_season {
        return Err(reject("wrong-shape", "not a season pack"));
    }
    if parsed.season != Some(season) {
        return Err(reject("wrong-season", format!("{:?} vs {season}", parsed.season)));
    }
    Ok(profile.max_size_bytes_episode.saturating_mul(u64::from(episodes.max(1))))
}

fn push_line(lines: &mut Vec<ScoreLine>, rule: &str, delta: i32, note: String) {
    if delta != 0 {
        lines.push(ScoreLine { rule: rule.into(), delta, note });
    }
}

fn score_lines(
    parsed: &ParsedRelease,
    candidate: &Candidate,
    target: &Target,
    profile: &Profile,
    resolution: Res,
    max_size: u64,
    seeders: u32,
) -> Vec<ScoreLine> {
    let mut lines: Vec<ScoreLine> = Vec::new();

    push_line(
        &mut lines,
        "resolution",
        resolution_delta(resolution, profile.resolution),
        format!("{resolution:?} (preference {:?})", profile.resolution),
    );

    if let Some((delta, label)) = codec_line(parsed, profile) {
        push_line(&mut lines, "codec", delta, label.into());
    }

    if let Some(source) = parsed.source {
        let (delta, label) = source_line(source);
        push_line(&mut lines, "source", delta, label.into());
    }

    push_line(&mut lines, "seeders", (seeders.min(50) * 10) as i32, format!("{seeders} seeders"));

    if let Some(size) = candidate.size_bytes {
        if max_size > 0 && size >= max_size / 4 && size <= max_size * 3 / 4 {
            push_line(&mut lines, "size", 100, format!("{} in the sweet spot", gb(size)));
        }
    }
    if matches!(*target, Target::Season { .. }) {
        push_line(&mut lines, "season-pack", 300, "one grab covers the season".into());
    }
    if parsed.proper || parsed.repack {
        push_line(&mut lines, "proper", 50, if parsed.proper { "PROPER" } else { "REPACK" }.into());
    }
    if candidate.indexer_priority != 0 {
        push_line(&mut lines, "indexer-priority", candidate.indexer_priority, "indexer priority".into());
    }

    lines
}

fn resolution_delta(got: Res, want: Res) -> i32 {
    match (got, want) {
        (g, w) if g == w => 1000,
        (Res::R2160, Res::R1080) => 100,
        (Res::R1080, Res::R2160) | (Res::R720, Res::R1080) => 400,
        (Res::R720, Res::R2160) => 50,
        // Above-preference beyond the handled pairs (1080 over 720 pref...).
        _ => 100,
    }
}

fn codec_line(parsed: &ParsedRelease, profile: &Profile) -> Option<(i32, &'static str)> {
    match parsed.codec {
        Some(Codec::Hevc) if profile.prefer_hevc => Some((400, "HEVC (HEVC-first)")),
        Some(Codec::Hevc) => Some((100, "HEVC")),
        Some(Codec::Av1) => Some((150, "AV1")),
        _ => None,
    }
}

fn source_line(source: Source) -> (i32, &'static str) {
    match source {
        Source::Remux => (250, "Remux"),
        Source::BluRay => (200, "BluRay"),
        Source::WebDl => (200, "WEB-DL"),
        Source::WebRip => (100, "WEBRip"),
        Source::Hdtv => (25, "HDTV"),
        Source::Cam => (0, "cam"),
    }
}

fn gb(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
}
