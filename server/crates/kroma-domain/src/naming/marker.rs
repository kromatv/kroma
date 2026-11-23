//! Season/episode marker detection (`S01E02`, `s1e2`, `S01E02-E03`, `1x02`) and
//! season-folder recognition the cues that classify a file as a TV episode.

/// A season/episode marker found in a filename stem, plus the byte span it
/// occupies (so the caller can split the stem into show-vs-episode-title parts).
#[derive(Debug, PartialEq, Eq)]
pub(super) struct Marker {
    pub(super) season: u32,
    pub(super) episode: u32,
    pub(super) episode_end: Option<u32>,
    pub(super) start: usize,
    pub(super) end: usize,
}

/// Find the first plausible season/episode marker in a filename stem.
pub(super) fn find_marker(stem: &str) -> Option<Marker> {
    let lower = stem.to_ascii_lowercase();
    let b = lower.as_bytes();
    (0..b.len())
        .find_map(|i| match_sxxeyy(b, i, SEASONS))
        .or_else(|| (0..b.len()).find_map(|i| match_nxnn(b, i)))
}

pub(super) fn find_loose_marker(stem: &str, season: u32) -> Option<Marker> {
    let lower = stem.to_ascii_lowercase();
    let b = lower.as_bytes();
    (0..b.len())
        .find_map(|i| match_sxxeyy(b, i, LONG_RUN_SEASONS))
        .or_else(|| (0..b.len()).find_map(|i| match_absolute(b, i, season)))
        .or_else(|| match_leading(b, season))
}

const SEASONS: u32 = 100;
const LONG_RUN_SEASONS: u32 = 999;
const EPISODES: u32 = 9999;

fn match_sxxeyy(b: &[u8], i: usize, seasons: u32) -> Option<Marker> {
    if b[i] != b's' {
        return None;
    }
    let (sd, sn) = read_digits(b, i + 1);
    let j = skip_separator(b, i + 1 + sd);
    if sd == 0 || b.get(j) != Some(&b'e') {
        return None;
    }
    let (ed, en) = read_digits(b, j + 1);
    if ed == 0 || !plausible(sn, en, seasons) {
        return None;
    }
    let (episode_end, end) = episode_tail(b, j + 1 + ed);
    Some(Marker {
        season: sn,
        episode: en,
        episode_end,
        start: i,
        end,
    })
}

fn skip_separator(b: &[u8], at: usize) -> usize {
    match b.get(at) {
        Some(b' ' | b'.' | b'_') => at + 1,
        _ => at,
    }
}

fn episode_tail(b: &[u8], at: usize) -> (Option<u32>, usize) {
    let mut m = at;
    if b.get(m) == Some(&b'-') {
        m += 1;
    }
    if b.get(m) == Some(&b'e') {
        m += 1;
    }
    match read_digits(b, m) {
        (digits, last) if m > at && digits > 0 => (Some(last), m + digits),
        _ => (None, at),
    }
}

fn match_absolute(b: &[u8], i: usize, season: u32) -> Option<Marker> {
    if i > 0 && b[i - 1].is_ascii_alphanumeric() {
        return None;
    }
    let number = i + episode_word(&b[i..])?;
    let (digits, episode) = read_digits(b, number);
    (episode <= EPISODES).then_some(Marker {
        season,
        episode,
        episode_end: None,
        start: i,
        end: number + digits,
    })
}

fn episode_word(rest: &[u8]) -> Option<usize> {
    ["episode", "ep", "e"].iter().find_map(|word| {
        let after = rest.strip_prefix(word.as_bytes())?;
        let gap = after
            .iter()
            .take_while(|c| matches!(c, b'.' | b' ' | b'_' | b'-'))
            .count();
        after
            .get(gap)
            .filter(|c| c.is_ascii_digit())
            .map(|_| word.len() + gap)
    })
}

fn match_leading(b: &[u8], season: u32) -> Option<Marker> {
    let (digits, episode) = read_digits(b, 0);
    let bounded = b.get(digits).is_none_or(|c| !c.is_ascii_alphanumeric());
    (digits > 0 && digits <= 4 && bounded && episode <= EPISODES).then_some(Marker {
        season,
        episode,
        episode_end: None,
        start: 0,
        end: digits,
    })
}

// Try to match Form 2 (`NxNN`, e.g. `1x02`) starting at byte `i`. The season is
// bounded and must not be preceded by an alphanumeric (to avoid resolutions).
fn match_nxnn(b: &[u8], i: usize) -> Option<Marker> {
    if !b[i].is_ascii_digit() {
        return None;
    }
    let (sd, sn) = read_digits(b, i);
    let before_ok = i == 0 || !b[i - 1].is_ascii_alphanumeric();
    if !before_ok || sd < 1 || sn > 50 {
        return None;
    }
    let xpos = i + sd;
    if xpos >= b.len() || b[xpos] != b'x' {
        return None;
    }
    let (ed, en) = read_digits(b, xpos + 1);
    if ed < 1 || !plausible(sn, en, SEASONS) {
        return None;
    }
    Some(Marker {
        season: sn,
        episode: en,
        episode_end: None,
        start: i,
        end: xpos + 1 + ed,
    })
}

// Guard against resolutions / wild numbers being read as season/episode.
fn plausible(season: u32, episode: u32, seasons: u32) -> bool {
    season <= seasons && episode <= EPISODES
}

// Read a run of ASCII digits from `start`; returns (count, parsed value).
fn read_digits(b: &[u8], start: usize) -> (usize, u32) {
    let mut n = 0;
    while start + n < b.len() && b[start + n].is_ascii_digit() {
        n += 1;
    }
    if n == 0 {
        return (0, 0);
    }
    let value: u32 = std::str::from_utf8(&b[start..start + n])
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    (n, value)
}

/// "Season 01", "Saison 1", "Specials", "S01" → a season folder, not a show.
pub fn is_season_folder(name: &str) -> bool {
    let l = name.trim().to_ascii_lowercase();
    l == "specials"
        || l.starts_with("season")
        || l.starts_with("saison")
        || (l.starts_with('s') && l.len() <= 4 && l[1..].bytes().all(|c| c.is_ascii_digit()))
}

pub(super) fn folder_season(name: &str) -> Option<u32> {
    let l = name.trim().to_ascii_lowercase();
    if l == "specials" {
        return Some(0);
    }
    let rest = ["season", "saison", "s"]
        .iter()
        .find_map(|prefix| l.strip_prefix(prefix))
        .filter(|_| is_season_folder(name))?;
    let digits: String = rest
        .trim_start_matches([' ', '.', '_', '-'])
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    digits.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sxxeyy_basic() {
        let m = find_marker("Show.S01E02").unwrap();
        assert_eq!((m.season, m.episode, m.episode_end), (1, 2, None));
        // The reported span exactly covers the marker text.
        assert_eq!(&"Show.S01E02"[m.start..m.end], "S01E02");
    }

    #[test]
    fn multi_episode_dash_concatenated_and_bare() {
        let dash = find_marker("Show.S01E02-E03").unwrap();
        assert_eq!(
            (dash.season, dash.episode, dash.episode_end),
            (1, 2, Some(3))
        );
        // "S01E02E03" (no separator) still yields the second episode.
        let cat = find_marker("Show.S01E02E03").unwrap();
        assert_eq!(cat.episode_end, Some(3));
        // "S01E02-03": a bare trailing number after the dash.
        let bare = find_marker("Show.S01E02-03").unwrap();
        assert_eq!(bare.episode_end, Some(3));
    }

    #[test]
    fn nxnn_form() {
        let m = find_marker("Firefly 1x02 The Train Job").unwrap();
        assert_eq!((m.season, m.episode, m.episode_end), (1, 2, None));
    }

    #[test]
    fn resolution_is_not_a_marker() {
        // 1920x1080: season 1920 is out of the NxNN bound, so no marker.
        assert!(find_marker("Heat 1995 1920x1080").is_none());
    }

    #[test]
    fn implausible_season_rejected() {
        // s200e01: season 200 > 100 fails the plausibility guard.
        assert!(find_marker("Thing.S200E01").is_none());
    }

    #[test]
    fn half_a_marker_is_not_a_marker() {
        assert!(find_marker("Show S01 Complete").is_none());
        assert!(find_marker("Kill Bill Vol 2").is_none());
        assert!(find_marker("Show 1x").is_none());
    }

    #[test]
    fn no_marker_returns_none() {
        assert!(find_marker("The Matrix 1999").is_none());
    }

    #[test]
    fn nxnn_rejected_after_alphanumeric() {
        // The digit run must sit at a boundary; "abc1x02" is part of a token.
        assert!(find_marker("abc1x02").is_none());
    }

    #[test]
    fn a_separator_between_season_and_episode_still_reads_as_a_marker() {
        for stem in ["Show S01 E05 - Title", "Show.S01.E05", "Show_S01_E05"] {
            let m = find_marker(stem).unwrap();

            assert_eq!((m.season, m.episode), (1, 5), "{stem}");
        }
    }

    #[test]
    fn a_season_past_one_hundred_reads_only_as_a_loose_marker() {
        let strict = find_marker("S211E06 - Title");
        let loose = find_loose_marker("S211E06 - Title", 1).unwrap();

        assert!(strict.is_none());
        assert_eq!((loose.season, loose.episode, loose.end), (211, 6, 7));
    }

    #[test]
    fn an_absolute_episode_takes_the_season_it_is_given() {
        for (stem, end) in [
            ("Episode 259", 11),
            ("Ep. 259", 7),
            ("Ep259", 5),
            ("Show E12", 8),
        ] {
            let m = find_loose_marker(stem, 3).unwrap();

            assert_eq!((m.season, m.end), (3, end), "{stem}");
        }
        assert_eq!(find_loose_marker("Show E12", 3).unwrap().episode, 12);
    }

    #[test]
    fn a_leading_number_is_the_episode() {
        let titled = find_loose_marker("215 - Episode Title", 2).unwrap();
        let bare = find_loose_marker("03", 1).unwrap();

        assert_eq!((titled.season, titled.episode, titled.end), (2, 215, 3));
        assert_eq!(bare.episode, 3);
    }

    #[test]
    fn a_name_without_an_episode_number_has_no_loose_marker() {
        for stem in [
            "Episode Title",
            "example.S03Es03",
            "1080p Title",
            "20240512 - News",
        ] {
            assert!(find_loose_marker(stem, 1).is_none(), "{stem}");
        }
    }

    #[test]
    fn a_season_folder_names_its_season() {
        let names = ["Season 02", "Saison 1", "S3", "Specials", "Season 1 (2008)"];

        let seasons: Vec<_> = names.into_iter().map(folder_season).collect();

        assert_eq!(seasons, [Some(2), Some(1), Some(3), Some(0), Some(1)]);
        assert_eq!(folder_season("Season"), None);
        assert_eq!(folder_season("The Office"), None);
    }

    #[test]
    fn season_folder_recognition() {
        assert!(is_season_folder("Season 01"));
        assert!(is_season_folder("season 1"));
        assert!(is_season_folder("Saison 2"));
        assert!(is_season_folder("Specials"));
        assert!(is_season_folder("S01"));
        assert!(is_season_folder("s3"));
        assert!(!is_season_folder("The Office"));
        // Too long for the bare-S form.
        assert!(!is_season_folder("s2000"));
    }
}
