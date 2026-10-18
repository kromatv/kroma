use crate::{AirDate, Codec, Res, Source};

pub(super) fn parse_resolution(t: &str) -> Option<Res> {
    match t {
        "2160p" | "4k" | "uhd" => Some(Res::R2160),
        "1080p" | "1080i" => Some(Res::R1080),
        "720p" => Some(Res::R720),
        "480p" | "480i" | "576p" | "576i" | "sd" => Some(Res::Sd),
        // "1920x1080" style: dimensions, not an SxE marker (see the guard in
        // parse_episode_marker too).
        _ => match t.split_once('x') {
            Some((w, h)) => {
                let (w, h) = (w.parse::<u32>().ok()?, h.parse::<u32>().ok()?);
                match (w, h) {
                    (3840.., _) | (_, 2000..) => Some(Res::R2160),
                    (1900.., _) | (_, 1000..) => Some(Res::R1080),
                    (1200.., _) | (_, 700..) => Some(Res::R720),
                    (640.., _) | (_, 480..) => Some(Res::Sd),
                    _ => None,
                }
            }
            None => None,
        },
    }
}

pub(super) fn parse_codec(t: &str) -> Option<Codec> {
    match t {
        "x265" | "h265" | "h.265" | "hevc" => Some(Codec::Hevc),
        "x264" | "h264" | "h.264" | "avc" => Some(Codec::H264),
        "av1" => Some(Codec::Av1),
        "vp9" => Some(Codec::Vp9),
        "xvid" | "divx" => Some(Codec::Xvid),
        _ => None,
    }
}

pub(super) fn parse_source(t: &str, next: Option<&str>) -> Option<Source> {
    match t {
        "remux" => Some(Source::Remux),
        "bluray" | "blu-ray" | "bdrip" | "brrip" | "bdremux" => Some(Source::BluRay),
        "web-dl" | "webdl" => Some(Source::WebDl),
        "webrip" | "web-rip" => Some(Source::WebRip),
        // Bare "WEB": WEB-DL unless the next token says otherwise ("WEB DL" /
        // "WEB RIP" split across tokens).
        "web" => match next.map(str::to_ascii_lowercase).as_deref() {
            Some("rip") => Some(Source::WebRip),
            _ => Some(Source::WebDl),
        },
        "hdtv" | "pdtv" | "dsr" => Some(Source::Hdtv),
        "cam" | "hdcam" | "camrip" | "ts" | "telesync" | "hdts" | "telecine" | "screener"
        | "dvdscr" | "workprint" => Some(Source::Cam),
        "dvd" | "dvdrip" | "dvd-rip" | "dvdr" | "dvd5" | "dvd9" => Some(Source::Dvd),
        _ => None,
    }
}

pub(super) struct EpisodeMarker {
    pub season: u32,
    pub season_end: Option<u32>,
    pub episode: Option<u32>,
    pub episode_end: Option<u32>,
    pub full_season: bool,
}

impl EpisodeMarker {
    fn whole_season(season: u32) -> Self {
        Self {
            season,
            season_end: None,
            episode: None,
            episode_end: None,
            full_season: true,
        }
    }

    fn seasons(season: u32, season_end: u32) -> Self {
        Self {
            season_end: Some(season_end),
            ..Self::whole_season(season)
        }
    }

    fn episodes(season: u32, episode: u32, episode_end: Option<u32>) -> Self {
        Self {
            episode: Some(episode),
            episode_end,
            full_season: false,
            ..Self::whole_season(season)
        }
    }
}

pub(super) fn parse_episode_marker(t: &str) -> Option<EpisodeMarker> {
    if let Some(rest) = t.strip_prefix('s') {
        return parse_s_marker(rest);
    }
    // NxMM: small left side only, so 1920x1080 stays a resolution.
    if let Some((s, e)) = t.split_once('x') {
        return parse_x_marker(s, e);
    }
    None
}

fn parse_s_marker(rest: &str) -> Option<EpisodeMarker> {
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() || digits.len() > 2 {
        return None;
    }
    let season: u32 = digits.parse().ok()?;
    let tail = &rest[digits.len()..];
    if tail.is_empty() {
        return Some(EpisodeMarker::whole_season(season));
    }
    if let Some(end) = last_season(tail, season) {
        return Some(EpisodeMarker::seasons(season, end));
    }
    parse_episodes(season, tail)
}

fn last_season(tail: &str, season: u32) -> Option<u32> {
    let digits = tail.strip_prefix("-s")?;
    if digits.is_empty() || digits.len() > 2 || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok().filter(|&end| end > season)
}

fn parse_episodes(season: u32, tail: &str) -> Option<EpisodeMarker> {
    let mut eps: Vec<u32> = Vec::new();
    for part in tail.split(['e', '-']) {
        if part.is_empty() {
            continue;
        }
        if !part.chars().all(|c| c.is_ascii_digit()) || part.len() > 3 {
            return None;
        }
        eps.push(part.parse().ok()?);
    }
    if !tail.starts_with('e') || eps.is_empty() {
        return None;
    }
    let first = eps[0];
    let last = eps.last().copied().filter(|&l| l > first);
    Some(EpisodeMarker::episodes(season, first, last))
}

fn parse_x_marker(s: &str, e: &str) -> Option<EpisodeMarker> {
    if !s.is_empty()
        && !e.is_empty()
        && s.chars().all(|c| c.is_ascii_digit())
        && e.chars().all(|c| c.is_ascii_digit())
        && s.len() <= 2
        && (2..=3).contains(&e.len())
    {
        let season: u32 = s.parse().ok()?;
        let episode: u32 = e.parse().ok()?;
        if season <= 50 && episode <= 999 {
            return Some(EpisodeMarker::episodes(season, episode, None));
        }
    }
    None
}

pub(super) fn parse_year(t: &str) -> Option<u32> {
    if t.len() != 4 || !t.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let y: u32 = t.parse().ok()?;
    (1900..=2035).contains(&y).then_some(y)
}

pub(super) fn parse_air_date(from: &[String]) -> Option<AirDate> {
    let head = from.first()?;
    AirDate::parse(head).or_else(|| {
        let joined = format!("{head}-{}-{}", from.get(1)?, from.get(2)?);
        AirDate::parse(&joined)
    })
}
