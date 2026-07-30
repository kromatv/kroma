//! Sonarr/Radarr-style file naming: render a path template against a title's
//! facts. Unknown tokens render empty; the token vocabulary lives in [`tokens`].

use std::path::PathBuf;

use crate::engine::services::settings::Settings;

mod tokens;

/// The facts a template renders against; some fields are only populated on one
/// of the two paths (import from a release name, bulk rename from probed streams).
#[derive(Debug, Clone, Default)]
pub struct NameContext {
    pub title: String,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub episode_title: Option<String>,
    pub resolution: Option<String>,
    pub codec: Option<String>,
    pub source: Option<String>,
    pub proper: bool,
    pub repack: bool,
    pub release_group: Option<String>,
    pub edition: Option<String>,
    pub imdb_id: Option<String>,
    pub tmdb_id: Option<u64>,
    pub audio_codec: Option<String>,
    pub audio_channels: Option<String>,
    pub video_bit_depth: Option<u32>,
    pub dynamic_range: Option<String>,
    pub audio_languages: Vec<String>,
    pub subtitle_languages: Vec<String>,
}

impl NameContext {
    fn quality_full(&self) -> String {
        let mut q = self.quality_title();
        if self.proper {
            q.push_str(" Proper");
        } else if self.repack {
            q.push_str(" Repack");
        }
        q.trim().to_string()
    }

    fn quality_title(&self) -> String {
        match (self.source.as_deref(), self.resolution.as_deref()) {
            (Some(s), Some(r)) => format!("{s}-{r}"),
            (Some(s), None) => s.to_string(),
            (None, Some(r)) => r.to_string(),
            (None, None) => String::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Casing {
    #[default]
    Default,
    Upper,
    Lower,
}

impl Casing {
    pub fn from_key(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "upper" | "uppercase" => Self::Upper,
            "lower" | "lowercase" => Self::Lower,
            _ => Self::Default,
        }
    }

    pub fn as_key(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Upper => "upper",
            Self::Lower => "lower",
        }
    }

    fn apply(self, s: &str) -> String {
        match self {
            Self::Default => s.to_string(),
            Self::Upper => s.to_uppercase(),
            Self::Lower => s.to_lowercase(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct NamingTemplates {
    pub movie_folder: String,
    pub movie_file: String,
    pub series_folder: String,
    pub season_folder: String,
    pub episode_file: String,
    pub case: Casing,
}

pub const DEFAULT_MOVIE_FOLDER: &str = "{Movie Title} ({Release Year})";
pub const DEFAULT_MOVIE_FILE: &str = "{Movie Title} ({Release Year}) {Quality Full}";
pub const DEFAULT_SERIES_FOLDER: &str = "{Series Title} ({Release Year})";
pub const DEFAULT_SEASON_FOLDER: &str = "Season {season:00}";
pub const DEFAULT_EPISODE_FILE: &str =
    "{Series Title} - S{season:00}E{episode:00} - {Episode Title} {Quality Full}";

impl NamingTemplates {
    pub fn from_settings(settings: &Settings) -> Self {
        let g = |key: &str, default: &str| {
            let v = settings.get_str(key, default);
            if v.trim().is_empty() {
                default.to_string()
            } else {
                v
            }
        };
        Self {
            movie_folder: g("namingMovieFolder", DEFAULT_MOVIE_FOLDER),
            movie_file: g("namingMovieFile", DEFAULT_MOVIE_FILE),
            series_folder: g("namingSeriesFolder", DEFAULT_SERIES_FOLDER),
            season_folder: g("namingSeasonFolder", DEFAULT_SEASON_FOLDER),
            episode_file: g("namingEpisodeFile", DEFAULT_EPISODE_FILE),
            case: Casing::from_key(&settings.get_str("namingCase", "default")),
        }
    }

    /// The same templates through the [`HostCtx`] settings seam, so an
    /// out-of-process module reads them without linking the engine's `Settings`.
    pub fn from_host(host: &dyn crate::host::HostCtx) -> Self {
        let g = |key: &str, default: &str| {
            let v = host.setting_str(key, default);
            if v.trim().is_empty() {
                default.to_string()
            } else {
                v
            }
        };
        Self {
            movie_folder: g("namingMovieFolder", DEFAULT_MOVIE_FOLDER),
            movie_file: g("namingMovieFile", DEFAULT_MOVIE_FILE),
            series_folder: g("namingSeriesFolder", DEFAULT_SERIES_FOLDER),
            season_folder: g("namingSeasonFolder", DEFAULT_SEASON_FOLDER),
            episode_file: g("namingEpisodeFile", DEFAULT_EPISODE_FILE),
            case: Casing::from_key(&g("namingCase", "default")),
        }
    }

    fn styled(&self, template: &str, ctx: &NameContext) -> String {
        self.case.apply(&render(template, ctx))
    }

    /// `<movie folder>/<movie file>.<ext>`; the folder is omitted when its
    /// template is empty, so files can live at the library root.
    pub fn movie_rel_path(&self, ctx: &NameContext, ext: &str) -> PathBuf {
        let file = file_component(&self.styled(&self.movie_file, ctx), ext);
        match sanitize(&self.styled(&self.movie_folder, ctx)) {
            folder if folder.is_empty() => PathBuf::from(file),
            folder => PathBuf::from(folder).join(file),
        }
    }

    /// `<series folder>/<season folder>/<episode file>.<ext>`.
    pub fn episode_rel_path(&self, ctx: &NameContext, ext: &str) -> PathBuf {
        let file = file_component(&self.styled(&self.episode_file, ctx), ext);
        let mut p = PathBuf::from(sanitize(&self.styled(&self.series_folder, ctx)));
        let season_folder = sanitize(&self.styled(&self.season_folder, ctx));
        if !season_folder.is_empty() {
            p.push(season_folder);
        }
        p.push(file);
        p
    }
}

fn file_component(rendered: &str, ext: &str) -> String {
    let name = sanitize(rendered);
    if name.is_empty() {
        format!("file.{ext}")
    } else {
        format!("{name}.{ext}")
    }
}

/// Cleaned but NOT sanitized: the path builders sanitize each component, so
/// separators survive rendering.
pub fn render(template: &str, ctx: &NameContext) -> String {
    let mut out = String::new();
    let mut chars = template.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '{' {
            let mut inner = String::new();
            for c2 in chars.by_ref() {
                if c2 == '}' {
                    break;
                }
                inner.push(c2);
            }
            out.push_str(&tokens::resolve_token(&inner, ctx));
        } else {
            out.push(c);
        }
    }
    cleanup(&out)
}

fn cleanup(s: &str) -> String {
    let mut r = s.split_whitespace().collect::<Vec<_>>().join(" ");
    for empty in ["( )", "()", "[ ]", "[]", "- -"] {
        while r.contains(empty) {
            r = r.replace(empty, "-");
        }
    }
    r = r.split_whitespace().collect::<Vec<_>>().join(" ");
    let joined = r.split(" - ").map(str::trim).filter(|p| !p.is_empty()).collect::<Vec<_>>().join(" - ");
    joined.trim().trim_matches('-').trim().to_string()
}

/// Resolution, codec and source in the spellings Sonarr/Radarr use (`1080p`,
/// `x265`, `Bluray`).
pub fn quality_from_parsed(
    parsed: &crate::scene::ParsedRelease,
) -> (Option<String>, Option<String>, Option<String>) {
    use crate::scene::{Codec, Res, Source};
    let res = parsed.resolution.map(|r| match r {
        Res::R720 => "720p",
        Res::R1080 => "1080p",
        Res::R2160 => "2160p",
    });
    let codec = parsed.codec.map(|c| match c {
        Codec::Hevc => "x265",
        Codec::H264 => "x264",
        Codec::Av1 => "AV1",
        Codec::Xvid => "Xvid",
    });
    let source = parsed.source.map(|s| match s {
        Source::Remux => "Remux",
        Source::BluRay => "Bluray",
        Source::WebDl => "WEBDL",
        Source::WebRip => "WEBRip",
        Source::Hdtv => "HDTV",
        Source::Cam => "Cam",
    });
    (res.map(str::to_string), codec.map(str::to_string), source.map(str::to_string))
}

pub fn resolution_from_width(width: Option<i64>) -> Option<String> {
    match width? {
        w if w >= 3400 => Some("2160p".into()),
        w if w >= 1700 => Some("1080p".into()),
        w if w >= 1200 => Some("720p".into()),
        w if w >= 640 => Some("480p".into()),
        _ => None,
    }
}

pub fn codec_label(codec: Option<&str>) -> Option<String> {
    match codec?.to_ascii_lowercase().as_str() {
        "hevc" | "h265" | "x265" => Some("x265".into()),
        "h264" | "avc" | "x264" => Some("x264".into()),
        "av1" => Some("AV1".into()),
        other => Some(other.to_string()),
    }
}

/// Channel count to layout label, Radarr-style: `6` -> `5.1`.
pub fn audio_channels_label(channels: Option<u32>) -> Option<String> {
    Some(
        match channels? {
            0 => return None,
            1 => "1.0",
            2 => "2.0",
            3 => "2.1",
            6 => "5.1",
            7 => "6.1",
            8 => "7.1",
            n => return Some(format!("{n}.0")),
        }
        .to_string(),
    )
}

/// Audio codec label in the spelling scene groups use: `eac3` -> `EAC3`.
pub fn audio_codec_label(codec: Option<&str>) -> Option<String> {
    let c = codec?.to_ascii_lowercase();
    if c.is_empty() {
        return None;
    }
    Some(
        match c.as_str() {
            "aac" => "AAC",
            "ac3" | "ac-3" => "AC3",
            "eac3" | "e-ac-3" => "EAC3",
            "dts" => "DTS",
            "truehd" => "TrueHD",
            "flac" => "FLAC",
            "opus" => "Opus",
            "mp3" => "MP3",
            "vorbis" => "Vorbis",
            other => return Some(other.to_uppercase()),
        }
        .to_string(),
    )
}

/// `HDR` / `DV` label, or `None` for SDR.
pub fn dynamic_range(hdr: bool, dolby_vision: bool) -> Option<String> {
    if dolby_vision {
        Some("DV".into())
    } else if hdr {
        Some("HDR".into())
    } else {
        None
    }
}

/// Normalize a stream language tag to a 2-letter upper code (`eng` -> `EN`);
/// `None` for undefined/unknown, so it drops out of the `[EN+FR]` tag.
pub fn lang_code(lang: &str) -> Option<String> {
    let l = lang.trim().to_ascii_lowercase();
    if l.is_empty() || l == "und" || l == "unknown" || l == "mis" || l == "zxx" {
        return None;
    }
    Some(
        match l.as_str() {
            "eng" | "en" => "EN",
            "fre" | "fra" | "fr" => "FR",
            "ger" | "deu" | "de" => "DE",
            "spa" | "es" => "ES",
            "ita" | "it" => "IT",
            "jpn" | "ja" => "JA",
            "por" | "pt" => "PT",
            "rus" | "ru" => "RU",
            "chi" | "zho" | "zh" => "ZH",
            "kor" | "ko" => "KO",
            "nld" | "dut" | "nl" => "NL",
            other => return Some(other.get(..2).unwrap_or(other).to_uppercase()),
        }
        .to_string(),
    )
}

/// Deduped and order-preserving.
pub fn lang_list<'a>(raw: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tag in raw {
        if let Some(code) = lang_code(tag) {
            if !out.contains(&code) {
                out.push(code);
            }
        }
    }
    out
}

/// Strips the Windows/SMB-reserved set, control characters, and trailing
/// dots/spaces, which Windows and SMB shares silently reject.
pub fn sanitize(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches(['.', ' '])
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn movie_ctx() -> NameContext {
        NameContext {
            title: "The Matrix".into(),
            year: Some(1999),
            resolution: Some("1080p".into()),
            source: Some("Bluray".into()),
            ..Default::default()
        }
    }

    fn episode_ctx() -> NameContext {
        NameContext {
            title: "Breaking Bad".into(),
            year: Some(2008),
            season: Some(1),
            episode: Some(2),
            episode_title: Some("Cat's in the Bag...".into()),
            resolution: Some("720p".into()),
            source: Some("HDTV".into()),
            ..Default::default()
        }
    }

    #[test]
    fn radarr_default_movie_format() {
        let tpl = NamingTemplates {
            movie_folder: DEFAULT_MOVIE_FOLDER.into(),
            movie_file: DEFAULT_MOVIE_FILE.into(),
            series_folder: String::new(),
            season_folder: String::new(),
            episode_file: String::new(),
            case: Casing::Default,
        };
        let p = tpl.movie_rel_path(&movie_ctx(), "mkv");
        assert_eq!(p.to_str().unwrap(), "The Matrix (1999)/The Matrix (1999) Bluray-1080p.mkv");
    }

    #[test]
    fn sonarr_default_episode_format() {
        let tpl = NamingTemplates {
            movie_folder: String::new(),
            movie_file: String::new(),
            series_folder: DEFAULT_SERIES_FOLDER.into(),
            season_folder: DEFAULT_SEASON_FOLDER.into(),
            episode_file: DEFAULT_EPISODE_FILE.into(),
            case: Casing::Default,
        };
        let p = tpl.episode_rel_path(&episode_ctx(), "mkv");
        assert_eq!(
            p.to_str().unwrap(),
            "Breaking Bad (2008)/Season 01/Breaking Bad - S01E02 - Cat's in the Bag... HDTV-720p.mkv"
        );
    }

    #[test]
    fn missing_tokens_clean_up() {
        let ctx = NameContext { title: "Show".into(), season: Some(3), episode: Some(7), ..Default::default() };
        assert_eq!(render("{Title} ({Year})", &ctx), "Show");
        assert_eq!(
            render("{Title} - S{season:00}E{episode:00} - {Episode Title} {Quality Full}", &ctx),
            "Show - S03E07"
        );
    }

    #[test]
    fn padding_respects_spec() {
        let ctx = NameContext { season: Some(1), episode: Some(5), ..Default::default() };
        assert_eq!(render("S{season:00}E{episode:00}", &ctx), "S01E05");
        assert_eq!(render("S{season:000}E{episode}", &ctx), "S001E5");
        assert_eq!(render("{season}x{episode:00}", &ctx), "1x05");
    }

    #[test]
    fn forbidden_chars_removed_from_filename() {
        let tpl = NamingTemplates {
            movie_folder: String::new(),
            movie_file: "{Movie Title} ({Release Year})".into(),
            series_folder: String::new(),
            season_folder: String::new(),
            episode_file: String::new(),
            case: Casing::Default,
        };
        let ctx = NameContext { title: "Mission: Impossible".into(), year: Some(1996), ..Default::default() };
        let p = tpl.movie_rel_path(&ctx, "mkv");
        assert_eq!(p.to_str().unwrap(), "Mission Impossible (1996).mkv");
        assert!(!p.to_str().unwrap().contains(':'));
    }

    #[test]
    fn case_transform_applies() {
        let mk = |case: Casing| NamingTemplates {
            movie_folder: String::new(),
            movie_file: "{Movie Title} ({Release Year})".into(),
            series_folder: String::new(),
            season_folder: String::new(),
            episode_file: String::new(),
            case,
        };
        let ctx = NameContext { title: "The Matrix".into(), year: Some(1999), ..Default::default() };
        assert_eq!(mk(Casing::Upper).movie_rel_path(&ctx, "mkv").to_str().unwrap(), "THE MATRIX (1999).mkv");
        assert_eq!(mk(Casing::Lower).movie_rel_path(&ctx, "mkv").to_str().unwrap(), "the matrix (1999).mkv");
        assert_eq!(mk(Casing::Default).movie_rel_path(&ctx, "mkv").to_str().unwrap(), "The Matrix (1999).mkv");
    }

    #[test]
    fn sanitize_strips_reserved_and_trailing() {
        assert_eq!(sanitize("A/B:C*?\"<>|D"), "A B C D");
        assert_eq!(sanitize("Trailing dots..."), "Trailing dots");
        assert_eq!(sanitize("Trailing space "), "Trailing space");
    }

    #[test]
    fn sanitize_collapses_control_and_whitespace() {
        assert_eq!(sanitize("a\tb\nc"), "a b c");
        assert_eq!(sanitize("  many   spaces  "), "many spaces");
        assert_eq!(sanitize(""), "");
    }

    #[test]
    fn quality_full_variants() {
        let base = NameContext {
            source: Some("Bluray".into()),
            resolution: Some("1080p".into()),
            ..Default::default()
        };
        assert_eq!(base.quality_full(), "Bluray-1080p");
        assert_eq!(base.quality_title(), "Bluray-1080p");

        let proper = NameContext { proper: true, ..base.clone() };
        assert_eq!(proper.quality_full(), "Bluray-1080p Proper");
        assert_eq!(proper.quality_title(), "Bluray-1080p");

        let repack = NameContext { repack: true, ..base.clone() };
        assert_eq!(repack.quality_full(), "Bluray-1080p Repack");

        // Proper wins over repack when (implausibly) both are set.
        let both = NameContext { proper: true, repack: true, ..base };
        assert_eq!(both.quality_full(), "Bluray-1080p Proper");
    }

    #[test]
    fn quality_title_partial_and_empty() {
        let source_only = NameContext { source: Some("WEBDL".into()), ..Default::default() };
        assert_eq!(source_only.quality_title(), "WEBDL");

        let res_only = NameContext { resolution: Some("720p".into()), ..Default::default() };
        assert_eq!(res_only.quality_title(), "720p");

        let empty = NameContext::default();
        assert_eq!(empty.quality_title(), "");
        assert_eq!(empty.quality_full(), "");

        let proper_only = NameContext { proper: true, ..Default::default() };
        assert_eq!(proper_only.quality_full(), "Proper");
    }

    #[test]
    fn casing_from_and_as_key_round_trip() {
        assert_eq!(Casing::from_key("upper"), Casing::Upper);
        assert_eq!(Casing::from_key("UPPERCASE"), Casing::Upper);
        assert_eq!(Casing::from_key("  Lower  "), Casing::Lower);
        assert_eq!(Casing::from_key("lowercase"), Casing::Lower);
        assert_eq!(Casing::from_key("default"), Casing::Default);
        assert_eq!(Casing::from_key("nonsense"), Casing::Default);
        assert_eq!(Casing::from_key(""), Casing::Default);

        for c in [Casing::Upper, Casing::Lower, Casing::Default] {
            assert_eq!(Casing::from_key(c.as_key()), c);
        }
        assert_eq!(Casing::default(), Casing::Default);
    }

    #[test]
    fn resolution_from_width_buckets() {
        assert_eq!(resolution_from_width(None), None);
        assert_eq!(resolution_from_width(Some(0)), None);
        assert_eq!(resolution_from_width(Some(639)), None);
        assert_eq!(resolution_from_width(Some(-10)), None);
        assert_eq!(resolution_from_width(Some(640)).as_deref(), Some("480p"));
        assert_eq!(resolution_from_width(Some(1199)).as_deref(), Some("480p"));
        assert_eq!(resolution_from_width(Some(1200)).as_deref(), Some("720p"));
        assert_eq!(resolution_from_width(Some(1699)).as_deref(), Some("720p"));
        assert_eq!(resolution_from_width(Some(1700)).as_deref(), Some("1080p"));
        assert_eq!(resolution_from_width(Some(3399)).as_deref(), Some("1080p"));
        assert_eq!(resolution_from_width(Some(3400)).as_deref(), Some("2160p"));
        assert_eq!(resolution_from_width(Some(7680)).as_deref(), Some("2160p"));
    }

    #[test]
    fn codec_label_maps_known_and_passes_through() {
        assert_eq!(codec_label(Some("HEVC")).as_deref(), Some("x265"));
        assert_eq!(codec_label(Some("h265")).as_deref(), Some("x265"));
        assert_eq!(codec_label(Some("x265")).as_deref(), Some("x265"));
        assert_eq!(codec_label(Some("AVC")).as_deref(), Some("x264"));
        assert_eq!(codec_label(Some("h264")).as_deref(), Some("x264"));
        assert_eq!(codec_label(Some("x264")).as_deref(), Some("x264"));
        assert_eq!(codec_label(Some("AV1")).as_deref(), Some("AV1"));
        assert_eq!(codec_label(Some("VP9")).as_deref(), Some("vp9"));
        assert_eq!(codec_label(None), None);
    }

    #[test]
    fn audio_channels_label_layouts() {
        assert_eq!(audio_channels_label(None), None);
        assert_eq!(audio_channels_label(Some(0)), None);
        assert_eq!(audio_channels_label(Some(1)).as_deref(), Some("1.0"));
        assert_eq!(audio_channels_label(Some(2)).as_deref(), Some("2.0"));
        assert_eq!(audio_channels_label(Some(3)).as_deref(), Some("2.1"));
        assert_eq!(audio_channels_label(Some(6)).as_deref(), Some("5.1"));
        assert_eq!(audio_channels_label(Some(7)).as_deref(), Some("6.1"));
        assert_eq!(audio_channels_label(Some(8)).as_deref(), Some("7.1"));
        assert_eq!(audio_channels_label(Some(4)).as_deref(), Some("4.0"));
        assert_eq!(audio_channels_label(Some(5)).as_deref(), Some("5.0"));
    }

    #[test]
    fn audio_codec_label_maps_and_uppercases() {
        assert_eq!(audio_codec_label(Some("aac")).as_deref(), Some("AAC"));
        assert_eq!(audio_codec_label(Some("AC-3")).as_deref(), Some("AC3"));
        assert_eq!(audio_codec_label(Some("ac3")).as_deref(), Some("AC3"));
        assert_eq!(audio_codec_label(Some("e-ac-3")).as_deref(), Some("EAC3"));
        assert_eq!(audio_codec_label(Some("eac3")).as_deref(), Some("EAC3"));
        assert_eq!(audio_codec_label(Some("dts")).as_deref(), Some("DTS"));
        assert_eq!(audio_codec_label(Some("TrueHD")).as_deref(), Some("TrueHD"));
        assert_eq!(audio_codec_label(Some("flac")).as_deref(), Some("FLAC"));
        assert_eq!(audio_codec_label(Some("opus")).as_deref(), Some("Opus"));
        assert_eq!(audio_codec_label(Some("mp3")).as_deref(), Some("MP3"));
        assert_eq!(audio_codec_label(Some("vorbis")).as_deref(), Some("Vorbis"));
        assert_eq!(audio_codec_label(Some("wma")).as_deref(), Some("WMA"));
        assert_eq!(audio_codec_label(Some("")), None);
        assert_eq!(audio_codec_label(None), None);
    }

    #[test]
    fn dynamic_range_priority() {
        assert_eq!(dynamic_range(false, false), None);
        assert_eq!(dynamic_range(true, false).as_deref(), Some("HDR"));
        assert_eq!(dynamic_range(false, true).as_deref(), Some("DV"));
        assert_eq!(dynamic_range(true, true).as_deref(), Some("DV"));
    }

    #[test]
    fn lang_code_normalizes_and_rejects() {
        assert_eq!(lang_code("eng").as_deref(), Some("EN"));
        assert_eq!(lang_code("EN").as_deref(), Some("EN"));
        assert_eq!(lang_code("  fra  ").as_deref(), Some("FR"));
        assert_eq!(lang_code("deu").as_deref(), Some("DE"));
        assert_eq!(lang_code("jpn").as_deref(), Some("JA"));
        assert_eq!(lang_code("zho").as_deref(), Some("ZH"));
        assert_eq!(lang_code("nld").as_deref(), Some("NL"));
        assert_eq!(lang_code("swe").as_deref(), Some("SW"));
        // A single-char tag has no 2-byte slice: falls back to the whole word.
        assert_eq!(lang_code("x").as_deref(), Some("X"));
        for junk in ["", "und", "unknown", "mis", "zxx", "  "] {
            assert_eq!(lang_code(junk), None, "{junk:?} should be rejected");
        }
    }

    #[test]
    fn lang_list_dedupes_in_order() {
        let out = lang_list(["eng", "en", "fre", "und", "xx", "fre"]);
        assert_eq!(out, vec!["EN".to_string(), "FR".to_string(), "XX".to_string()]);
        assert!(lang_list(std::iter::empty::<&str>()).is_empty());
        assert!(lang_list(["und", "zxx"]).is_empty());
    }

    #[test]
    fn quality_from_parsed_maps_every_variant() {
        use crate::scene::{Codec, ParsedRelease, Res, Source};
        let mk = |r, c, s| ParsedRelease {
            resolution: Some(r),
            codec: Some(c),
            source: Some(s),
            ..Default::default()
        };
        assert_eq!(
            quality_from_parsed(&mk(Res::R720, Codec::H264, Source::BluRay)),
            (Some("720p".into()), Some("x264".into()), Some("Bluray".into()))
        );
        assert_eq!(
            quality_from_parsed(&mk(Res::R1080, Codec::Av1, Source::WebDl)),
            (Some("1080p".into()), Some("AV1".into()), Some("WEBDL".into()))
        );
        assert_eq!(
            quality_from_parsed(&mk(Res::R2160, Codec::Xvid, Source::WebRip)),
            (Some("2160p".into()), Some("Xvid".into()), Some("WEBRip".into()))
        );
        assert_eq!(
            quality_from_parsed(&mk(Res::R2160, Codec::Hevc, Source::Remux)),
            (Some("2160p".into()), Some("x265".into()), Some("Remux".into()))
        );
        let hdtv = ParsedRelease { source: Some(Source::Hdtv), ..Default::default() };
        assert_eq!(quality_from_parsed(&hdtv).2.as_deref(), Some("HDTV"));
        let cam = ParsedRelease { source: Some(Source::Cam), ..Default::default() };
        assert_eq!(quality_from_parsed(&cam).2.as_deref(), Some("Cam"));
        assert_eq!(quality_from_parsed(&ParsedRelease::default()), (None, None, None));
    }

    #[test]
    fn render_cleans_empty_delimiters() {
        let ctx = NameContext { title: "Show".into(), ..Default::default() };
        assert_eq!(render("{Movie Title} ({Release Year})", &ctx), "Show");
        assert_eq!(render("{Movie Title} [{Resolution}]", &ctx), "Show");
        assert_eq!(render("{Movie Title} ({Release Year}) [{Resolution}]", &ctx), "Show");
        assert_eq!(render("{Movie Title} - {Episode Title} - {Resolution}", &ctx), "Show");
        assert_eq!(render("({Release Year})", &NameContext::default()), "");
    }

    #[test]
    fn file_component_falls_back_when_name_empty() {
        let tpl = NamingTemplates {
            movie_folder: String::new(),
            movie_file: "{Resolution}".into(),
            series_folder: String::new(),
            season_folder: String::new(),
            episode_file: String::new(),
            case: Casing::Default,
        };
        let p = tpl.movie_rel_path(&NameContext::default(), "mkv");
        assert_eq!(p.to_str().unwrap(), "file.mkv");
    }

    #[test]
    fn episode_path_skips_empty_season_folder() {
        let tpl = NamingTemplates {
            movie_folder: String::new(),
            movie_file: String::new(),
            series_folder: "{Series Title}".into(),
            season_folder: String::new(),
            episode_file: "{Episode Title}".into(),
            case: Casing::Default,
        };
        let ctx = NameContext {
            title: "Show".into(),
            episode_title: Some("Pilot".into()),
            ..Default::default()
        };
        let p = tpl.episode_rel_path(&ctx, "mkv");
        assert_eq!(p.to_str().unwrap(), "Show/Pilot.mkv");
    }

    fn store() -> (kroma_db::Pool, Settings) {
        static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("kroma-naming-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let pool = kroma_db::init(&path).unwrap();
        let settings = Settings::load(&pool);
        (pool, settings)
    }

    fn set(settings: &Settings, pool: &kroma_db::Pool, key: &str, value: &str) {
        settings.set_patch(
            pool,
            std::collections::BTreeMap::from([(key.to_string(), serde_json::json!(value))]),
        );
    }

    #[test]
    fn an_unconfigured_server_names_files_the_same_way_either_default_would() {
        // Two defaults exist for these keys: the settings store registers
        // `{Title} ({Year})` and `get_str` prefers it, while the constants here
        // only apply to a host that does not know the key. The spellings are
        // aliases for the same token, and this pins that they stay so.
        let (_pool, settings) = store();
        let from_store = NamingTemplates::from_settings(&settings);
        let from_constants = NamingTemplates {
            movie_folder: DEFAULT_MOVIE_FOLDER.into(),
            movie_file: DEFAULT_MOVIE_FILE.into(),
            series_folder: DEFAULT_SERIES_FOLDER.into(),
            season_folder: DEFAULT_SEASON_FOLDER.into(),
            episode_file: DEFAULT_EPISODE_FILE.into(),
            case: Casing::default(),
        };

        assert_ne!(from_store.movie_folder, from_constants.movie_folder, "two spellings");
        assert_eq!(
            from_store.movie_rel_path(&movie_ctx(), "mkv"),
            from_constants.movie_rel_path(&movie_ctx(), "mkv"),
            "the two defaults must name the same file",
        );
        assert_eq!(
            from_store.episode_rel_path(&episode_ctx(), "mkv"),
            from_constants.episode_rel_path(&episode_ctx(), "mkv"),
        );
    }

    #[test]
    fn a_template_an_admin_cleared_falls_back_rather_than_naming_everything_alike() {
        // An empty template renders empty, so every import would land on the
        // same path and overwrite the last one.
        let (pool, settings) = store();
        for key in [
            "namingMovieFolder",
            "namingMovieFile",
            "namingSeriesFolder",
            "namingSeasonFolder",
            "namingEpisodeFile",
        ] {
            set(&settings, &pool, key, "   ");
        }

        // A cleared field falls back to the CONSTANT, an untouched one to the
        // REGISTERED default: different strings that must still name one file.
        let cleared = NamingTemplates::from_settings(&settings);
        let (_p2, untouched) = store();
        let fresh = NamingTemplates::from_settings(&untouched);

        assert!(!cleared.movie_folder.trim().is_empty());
        assert!(!cleared.episode_file.trim().is_empty());
        assert_eq!(
            cleared.movie_rel_path(&movie_ctx(), "mkv"),
            fresh.movie_rel_path(&movie_ctx(), "mkv"),
        );
        assert_eq!(
            cleared.episode_rel_path(&episode_ctx(), "mkv"),
            fresh.episode_rel_path(&episode_ctx(), "mkv"),
        );
    }

    #[test]
    fn a_configured_template_is_used_as_written() {
        let (pool, settings) = store();
        set(&settings, &pool, "namingMovieFolder", "{Movie Title}");
        set(&settings, &pool, "namingCase", "lower");

        let t = NamingTemplates::from_settings(&settings);
        assert_eq!(t.movie_folder, "{Movie Title}");
        let path = t.movie_rel_path(&movie_ctx(), "mkv");
        assert!(path.starts_with("the matrix"), "{path:?}");
    }

    #[test]
    fn a_sidecar_reading_through_the_host_seam_gets_the_same_answers() {
        // If the two readers drifted, the same file would be named differently
        // depending on WHICH process imported it.
        let (pool, settings) = store();
        set(&settings, &pool, "namingMovieFolder", "{Movie Title} [{Release Year}]");
        set(&settings, &pool, "namingCase", "upper");

        let direct = NamingTemplates::from_settings(&settings);
        let host = settings_host(pool, settings);
        let seam = NamingTemplates::from_host(&host);

        assert_eq!(seam.movie_folder, direct.movie_folder);
        assert_eq!(seam.movie_file, direct.movie_file);
        assert_eq!(seam.series_folder, direct.series_folder);
        assert_eq!(seam.season_folder, direct.season_folder);
        assert_eq!(seam.episode_file, direct.episode_file);
        assert_eq!(
            seam.movie_rel_path(&movie_ctx(), "mkv"),
            direct.movie_rel_path(&movie_ctx(), "mkv"),
            "the two readers must produce the same path for the same file",
        );
    }

    #[test]
    fn the_host_seam_also_refuses_a_blank_template() {
        let (pool, settings) = store();
        set(&settings, &pool, "namingEpisodeFile", "");
        let host = settings_host(pool, settings);
        let episode_file = NamingTemplates::from_host(&host).episode_file;
        assert!(!episode_file.trim().is_empty(), "a blank template names every file alike");
        assert!(episode_file.contains("season"), "{episode_file}");
    }

    // Answers `setting_str` out of a REAL settings store, so `from_host` sees
    // the store's own registered defaults rather than the caller's.
    fn settings_host(pool: kroma_db::Pool, settings: Settings) -> impl crate::host::HostCtx {
        kroma_module_host::testing::StubHost::with_pool(pool)
            .with_string_settings(move |key, default| settings.get_str(key, default))
    }
}
