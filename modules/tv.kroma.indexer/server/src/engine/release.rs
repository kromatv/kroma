use std::collections::HashMap;

use crate::category;
use crate::definition::Definition;
use crate::{IndexerConfig, Release};

use super::request::join_url;

/// Map an extracted field set to a [`Release`], resolving relative URLs and
/// parsing sizes/numbers.
pub fn to_release(def: &Definition, cfg: &IndexerConfig, r: &HashMap<String, String>) -> Release {
    let get = |k: &str| r.get(k).map(String::as_str).filter(|s| !s.is_empty());
    let base = &cfg.base_url;

    let title = get("title").unwrap_or_default().to_string();
    let details_url = get("details").map(|d| join_url(base, d));

    // `download` may be a magnet or a (relative) .torrent link.
    let (mut link, mut magnet) = (None, get("magnet").map(str::to_string));
    if let Some(dl) = get("download") {
        if dl.starts_with("magnet:") {
            magnet.get_or_insert_with(|| dl.to_string());
        } else {
            link = Some(join_url(base, dl));
        }
    }

    let categories = category::newznab_for_tracker_id(def, get("category").unwrap_or_default())
        .into_iter()
        .collect();

    Release {
        guid: get("guid")
            .map(str::to_string)
            .or_else(|| details_url.clone())
            .unwrap_or_else(|| title.clone()),
        title,
        link,
        magnet,
        info_hash: get("infohash").map(str::to_string),
        size_bytes: get("size").and_then(parse_size),
        seeders: get("seeders").and_then(parse_int),
        leechers: get("leechers").and_then(parse_int),
        grabs: get("grabs").and_then(parse_int),
        imdb_id: get("imdbid").map(|s| format!("tt{}", s.trim_start_matches("tt"))),
        tmdb_id: get("tmdbid").and_then(|s| s.parse().ok()),
        published_at: get("date").map(str::to_string),
        details_url,
        categories,
        download_volume_factor: get("downloadvolumefactor").and_then(|s| s.parse().ok()),
        upload_volume_factor: get("uploadvolumefactor").and_then(|s| s.parse().ok()),
    }
}

// Strips everything but digits, so thousands separators and trailing labels
// (e.g. "12 seeders") are tolerated rather than rejected.
fn parse_int(s: &str) -> Option<u32> {
    let cleaned: String = s.chars().filter(char::is_ascii_digit).collect();
    cleaned.parse().ok()
}

/// Parse a human size (`1.5 GB`, `700 MiB`, `1,024 KB`, a bare byte count) to
/// bytes.
pub fn parse_size(s: &str) -> Option<u64> {
    let s = s.trim().replace(',', "");
    let split = s.find(char::is_alphabetic);
    let (num, unit) = match split {
        Some(i) => (s[..i].trim(), s[i..].trim().to_uppercase()),
        None => (s.as_str(), String::new()),
    };
    let value: f64 = num.trim().parse().ok()?;
    let mult = match unit.as_str() {
        "" | "B" => 1.0,
        "KB" | "KIB" | "K" => 1024.0,
        "MB" | "MIB" | "M" => 1024.0 * 1024.0,
        "GB" | "GIB" | "G" => 1024.0 * 1024.0 * 1024.0,
        "TB" | "TIB" | "T" => 1024.0_f64.powi(4),
        _ => return None,
    };
    Some((value * mult) as u64)
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{cat_def, cfg};
    use super::*;

    #[test]
    fn size_parsing() {
        assert_eq!(parse_size("1.5 GB"), Some(1_610_612_736));
        assert_eq!(parse_size("700 MB"), Some(734_003_200));
        assert_eq!(parse_size("1,024 KB"), Some(1_048_576));
        assert_eq!(parse_size("2048"), Some(2048));
    }

    #[test]
    fn size_parsing_units_and_edge_cases() {
        assert_eq!(parse_size("1 TB"), Some(1_099_511_627_776));
        assert_eq!(parse_size("512 MiB"), Some(536_870_912));
        // Bare single-letter unit.
        assert_eq!(parse_size("3G"), Some(3_221_225_472));
        assert_eq!(parse_size("0"), Some(0));
        // Unknown unit and a value with no leading number are rejected.
        assert_eq!(parse_size("1.5 XB"), None);
        assert_eq!(parse_size("abc"), None);
    }

    #[test]
    fn int_parsing_strips_non_digits() {
        assert_eq!(parse_int("1,234"), Some(1234));
        assert_eq!(parse_int("12 seeders"), Some(12));
        assert_eq!(parse_int("none"), None);
        assert_eq!(parse_int(""), None);
    }

    #[test]
    fn to_release_maps_every_field() {
        let def = cat_def();
        let cfg = cfg("https://site.to/");
        let mut r: HashMap<String, String> = HashMap::new();
        r.insert("title".into(), "Cool.Movie.2020.1080p".into());
        r.insert("details".into(), "/torrent/42".into());
        r.insert("download".into(), "/dl/42.torrent".into());
        r.insert("size".into(), "1.5 GB".into());
        r.insert("seeders".into(), "1,024".into());
        r.insert("leechers".into(), "12".into());
        r.insert("grabs".into(), "5".into());
        r.insert("category".into(), "100".into());
        r.insert("imdbid".into(), "0133093".into());
        r.insert("tmdbid".into(), "603".into());
        r.insert("date".into(), "2020-01-02".into());
        r.insert("infohash".into(), "DEADBEEF".into());
        r.insert("downloadvolumefactor".into(), "0.5".into());
        r.insert("uploadvolumefactor".into(), "1".into());

        let rel = to_release(&def, &cfg, &r);
        assert_eq!(rel.title, "Cool.Movie.2020.1080p");
        assert_eq!(
            rel.details_url.as_deref(),
            Some("https://site.to/torrent/42")
        );
        assert_eq!(rel.link.as_deref(), Some("https://site.to/dl/42.torrent"));
        assert_eq!(rel.magnet, None);
        assert_eq!(rel.size_bytes, Some(1_610_612_736));
        assert_eq!(rel.seeders, Some(1024));
        assert_eq!(rel.leechers, Some(12));
        assert_eq!(rel.grabs, Some(5));
        assert_eq!(rel.categories, vec![2040]);
        assert_eq!(rel.imdb_id.as_deref(), Some("tt0133093"));
        assert_eq!(rel.tmdb_id, Some(603));
        assert_eq!(rel.published_at.as_deref(), Some("2020-01-02"));
        assert_eq!(rel.info_hash.as_deref(), Some("DEADBEEF"));
        assert_eq!(rel.download_volume_factor, Some(0.5));
        assert_eq!(rel.upload_volume_factor, Some(1.0));
        // No explicit guid: falls back to the details URL.
        assert_eq!(rel.guid, "https://site.to/torrent/42");
    }

    #[test]
    fn to_release_download_magnet_and_guid_fallbacks() {
        let def = cat_def();
        let cfg = cfg("https://site.to/");

        // A magnet in `download` lands in `magnet`, never `link`.
        let mut r: HashMap<String, String> = HashMap::new();
        r.insert("title".into(), "Only Title".into());
        r.insert("download".into(), "magnet:?xt=urn:btih:ABC".into());
        let rel = to_release(&def, &cfg, &r);
        assert_eq!(rel.magnet.as_deref(), Some("magnet:?xt=urn:btih:ABC"));
        assert_eq!(rel.link, None);
        // No guid + no details: guid falls back to the title.
        assert_eq!(rel.guid, "Only Title");
        // Unmapped/empty category -> no categories.
        assert!(rel.categories.is_empty());

        // Explicit guid wins; an already-tt imdbid is not double-prefixed; an
        // explicit `magnet` key is kept when `download` is also a magnet.
        let mut r2: HashMap<String, String> = HashMap::new();
        r2.insert("title".into(), "T".into());
        r2.insert("guid".into(), "the-guid".into());
        r2.insert("magnet".into(), "magnet:?xt=urn:btih:KEEP".into());
        r2.insert("download".into(), "magnet:?xt=urn:btih:OTHER".into());
        r2.insert("imdbid".into(), "tt42".into());
        let rel2 = to_release(&def, &cfg, &r2);
        assert_eq!(rel2.guid, "the-guid");
        assert_eq!(rel2.magnet.as_deref(), Some("magnet:?xt=urn:btih:KEEP"));
        assert_eq!(rel2.imdb_id.as_deref(), Some("tt42"));
    }

    #[test]
    fn to_release_download_absolute_url_kept() {
        let def = cat_def();
        let cfg = cfg("https://site.to/");
        let mut r: HashMap<String, String> = HashMap::new();
        r.insert("title".into(), "T".into());
        r.insert("download".into(), "https://cdn.example/x.torrent".into());
        let rel = to_release(&def, &cfg, &r);
        assert_eq!(rel.link.as_deref(), Some("https://cdn.example/x.torrent"));
    }
}
