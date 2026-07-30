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

    // Form 1: SxxEyy [(-|E)zz]
    for i in 0..b.len() {
        if let Some(m) = match_sxxeyy(b, i) {
            return Some(m);
        }
    }

    // Form 2: NxNN (e.g. 1x02). Bounded season to avoid matching resolutions.
    for i in 0..b.len() {
        if let Some(m) = match_nxnn(b, i) {
            return Some(m);
        }
    }

    None
}

// Try to match Form 1 (`SxxEyy` with an optional multi-episode tail) starting
// at byte `i`. Returns the marker when the bytes at `i` form a valid one.
fn match_sxxeyy(b: &[u8], i: usize) -> Option<Marker> {
    if b[i] != b's' {
        return None;
    }
    let (sd, sn) = read_digits(b, i + 1);
    if sd == 0 {
        return None;
    }
    let j = i + 1 + sd;
    if j >= b.len() || b[j] != b'e' {
        return None;
    }
    let (ed, en) = read_digits(b, j + 1);
    if ed == 0 || !plausible(sn, en) {
        return None;
    }

    let mut k = j + 1 + ed;
    let mut episode_end = None;
    // Optional multi-episode tail: "-E03", "-03", "E03".
    let mut m = k;
    if m < b.len() && b[m] == b'-' {
        m += 1;
    }
    if m < b.len() && b[m] == b'e' {
        m += 1;
    }
    if m > k {
        let (ed2, en2) = read_digits(b, m);
        if ed2 > 0 {
            episode_end = Some(en2);
            k = m + ed2;
        }
    }
    Some(Marker {
        season: sn,
        episode: en,
        episode_end,
        start: i,
        end: k,
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
    if ed < 1 || !plausible(sn, en) {
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
fn plausible(season: u32, episode: u32) -> bool {
    season <= 100 && episode <= 9999
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
pub(super) fn is_season_folder(name: &str) -> bool {
    let l = name.trim().to_ascii_lowercase();
    l == "specials"
        || l.starts_with("season")
        || l.starts_with("saison")
        || (l.starts_with('s') && l.len() <= 4 && l[1..].bytes().all(|c| c.is_ascii_digit()))
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
        assert_eq!((dash.season, dash.episode, dash.episode_end), (1, 2, Some(3)));
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
    fn no_marker_returns_none() {
        assert!(find_marker("The Matrix 1999").is_none());
    }

    #[test]
    fn nxnn_rejected_after_alphanumeric() {
        // The digit run must sit at a boundary; "abc1x02" is part of a token.
        assert!(find_marker("abc1x02").is_none());
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
