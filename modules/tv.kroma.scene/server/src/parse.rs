//! Scene/P2P release-name parsing: tokenize on separators, then classify each
//! token (resolution, codec, source, season/episode markers, flags); the title
//! is everything before the first structural marker.

mod markers;
mod tags;

use self::markers::{
    parse_air_date, parse_codec, parse_episode_marker, parse_resolution, parse_source, parse_year,
};
use crate::{ParsedRelease, Source};

pub fn parse_release_name(name: &str) -> ParsedRelease {
    let (body, group) = split_group(name);
    let tokens: Vec<String> = body
        .split(['.', ' ', '_', '[', ']', '(', ')', '{', '}', ','])
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect();

    let mut out = ParsedRelease {
        group,
        ..ParsedRelease::default()
    };
    let mut first_marker: Option<usize> = None;

    for i in 0..tokens.len() {
        classify_token(&mut out, &mut first_marker, &tokens, i);
    }

    // A season with episodes is not a full-season pack even if COMPLETE-style
    // words appeared.
    if out.episode.is_some() {
        out.full_season = false;
    }

    let title_end = first_marker.unwrap_or(tokens.len());
    let title = strip_trailing_noise(&tokens[..title_end]);
    out.title = title.join(" ");
    tags::read_tags(&mut out, &tokens[title.len()..]);
    out
}

const TRAILING_NOISE: &[&str] = &[
    "complete",
    "completa",
    "integrale",
    "intégrale",
    "integral",
    "series",
    "serie",
    "multi",
    "multi3",
    "multi5",
    "dual",
    "dualaudio",
    "french",
    "truefrench",
    "vf",
    "vf2",
    "vff",
    "vfi",
    "vfq",
    "vq",
    "vo",
    "vost",
    "vostfr",
    "subfrench",
    "stfr",
    "english",
    "eng",
    "extended",
    "unrated",
    "uncut",
    "remastered",
    "imax",
];

fn strip_trailing_noise(run: &[String]) -> &[String] {
    let Some((_, rest)) = run.split_first() else {
        return run;
    };
    let noise = rest
        .iter()
        .rev()
        .take_while(|token| {
            TRAILING_NOISE
                .iter()
                .any(|word| token.eq_ignore_ascii_case(word))
        })
        .count();
    &run[..run.len() - noise]
}

fn mark(slot: &mut Option<usize>, i: usize) {
    if slot.is_none() || i < slot.unwrap() {
        *slot = Some(i);
    }
}

fn classify_token(
    out: &mut ParsedRelease,
    first_marker: &mut Option<usize>,
    tokens: &[String],
    i: usize,
) {
    let t = tokens[i].to_ascii_lowercase();

    if let Some(res) = parse_resolution(&t) {
        out.resolution = Some(out.resolution.map_or(res, |r| r.max(res)));
        mark(first_marker, i);
        return;
    }
    if let Some(codec) = parse_codec(&t) {
        out.codec = Some(codec);
        mark(first_marker, i);
        return;
    }
    if let Some(source) = parse_source(&t, tokens.get(i + 1).map(String::as_str)) {
        // "WEB" alone is weaker than an explicit WEBRip seen elsewhere.
        if out.source.is_none() || source != Source::WebDl {
            out.source = Some(source);
        }
        mark(first_marker, i);
        return;
    }
    if let Some(marker) = parse_episode_marker(&t) {
        out.season = out.season.or(Some(marker.season));
        out.season_end = out.season_end.or(marker.season_end);
        if let Some(episode) = marker.episode {
            out.episode = out.episode.or(Some(episode));
            out.episode_end = out.episode_end.or(marker.episode_end);
        } else if marker.full_season {
            out.full_season = true;
        }
        mark(first_marker, i);
        return;
    }
    classify_word(out, first_marker, tokens, i, &t);
}

fn classify_word(
    out: &mut ParsedRelease,
    first_marker: &mut Option<usize>,
    tokens: &[String],
    i: usize,
    t: &str,
) {
    match t {
        "proper" => out.proper = true,
        "repack" | "rerip" => out.repack = true,
        "hdr" | "hdr10" => out.hdr = true,
        "hdr10+" | "hdr10plus" | "hdr10p" => {
            out.hdr = true;
            out.hdr10_plus = true;
        }
        "hlg" => out.hlg = true,
        "dv" | "dovi" => out.dolby_vision = true,
        "vision" if i > 0 && tokens[i - 1].eq_ignore_ascii_case("dolby") => {
            out.dolby_vision = true;
        }
        "complete" | "integrale" | "intégrale" => out.full_season = true,
        "season" | "seasons" | "saison" | "saisons" => {
            mark_season_word(out, first_marker, tokens, i);
        }
        _ => mark_date_or_year(out, first_marker, tokens, i, t),
    }
}

fn mark_season_word(
    out: &mut ParsedRelease,
    first_marker: &mut Option<usize>,
    tokens: &[String],
    i: usize,
) {
    let Some((first, last)) = season_span(&tokens[i + 1..]) else {
        return;
    };
    out.season = out.season.or(Some(first));
    out.season_end = out.season_end.or(last);
    out.full_season = out.episode.is_none();
    mark(first_marker, i);
}

const RANGE_WORDS: &[&str] = &["a", "à", "to", "-"];

fn season_span(rest: &[String]) -> Option<(u32, Option<u32>)> {
    let head = rest.first()?;
    let (first, last) = match head.split_once('-') {
        Some((first, last)) => (season_number(first)?, season_number(last)),
        None => (season_number(head)?, spelled_range_end(rest)),
    };
    Some((first, last.filter(|&last| last > first)))
}

fn spelled_range_end(rest: &[String]) -> Option<u32> {
    let word = rest.get(1)?.to_lowercase();
    if !RANGE_WORDS.contains(&word.as_str()) {
        return None;
    }
    season_number(rest.get(2)?)
}

fn season_number(token: &str) -> Option<u32> {
    token.parse::<u32>().ok().filter(|&season| season <= 100)
}

fn mark_date_or_year(
    out: &mut ParsedRelease,
    first_marker: &mut Option<usize>,
    tokens: &[String],
    i: usize,
    t: &str,
) {
    if i > 0 {
        if let Some(date) = parse_air_date(&tokens[i..]) {
            out.air_date = Some(date);
            out.year = Some(date.year);
            mark(first_marker, i);
            return;
        }
    }
    mark_year_word(out, first_marker, i, t);
}

fn mark_year_word(out: &mut ParsedRelease, first_marker: &mut Option<usize>, i: usize, t: &str) {
    if let Some(year) = parse_year(t) {
        // Keep the LAST year-looking token ("2001 A Space Odyssey 1968" must not
        // lock onto 2001), but never one at index 0.
        if i > 0 {
            out.year = Some(year);
            mark(first_marker, i);
        }
    }
}

// The group is the text after the LAST hyphen when it looks like a tag
// (alphanumeric, short, no spaces) and is not itself a known token
// ("WEB-DL", "HDR10-PLUS"...).
fn split_group(name: &str) -> (String, Option<String>) {
    let trimmed = name.trim();
    if let Some((body, tail)) = trimmed.rsplit_once('-') {
        let tag = tail.trim();
        let lower = tag.to_ascii_lowercase();
        let known = parse_codec(&lower).is_some()
            || parse_source(&lower, None).is_some()
            || parse_resolution(&lower).is_some()
            || matches!(lower.as_str(), "dl" | "rip" | "plus" | "e" | "hd");
        let taggy = !tag.is_empty()
            && tag.len() <= 20
            && tag.chars().all(|c| c.is_ascii_alphanumeric())
            && tag.chars().any(|c| c.is_ascii_alphabetic())
            && !known;
        if taggy {
            return (body.to_string(), Some(tag.to_string()));
        }
    }
    (trimmed.to_string(), None)
}
