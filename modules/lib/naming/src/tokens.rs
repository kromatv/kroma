//! The `{...}` token vocabulary: resolve one token against a [`NameContext`],
//! honoring the optional `:spec` suffix (zero-pad width for numbers, byte
//! truncation for strings, `EN+DE` language filter for MediaInfo tokens).

use super::title::{clean_title, first_character, title_the};
use super::truncate::truncate;
use super::NameContext;

// Characters that may decorate a token inside the braces (`{[Quality Full]}`,
// `{-Release Group}`); the decoration is emitted only when the token resolves
// to a non-empty value, matching Radarr's presets.
const DECO: &[char] = &['[', ']', '(', ')', '-', '_', '.', ' '];

/// Render one `{...}` token (the text between the braces) against `ctx`, peeling
/// any leading/trailing decoration and re-attaching it only when the token has
/// a value.
pub fn resolve_token(inner: &str, ctx: &NameContext) -> String {
    let prefix: String = inner.chars().take_while(|c| DECO.contains(c)).collect();
    let suffix: String = inner
        .chars()
        .rev()
        .take_while(|c| DECO.contains(c))
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    // Decoration alone leaves the two halves overlapping, and there is no token
    // between them to resolve.
    let Some(core) = inner.get(prefix.len()..inner.len().saturating_sub(suffix.len())) else {
        return String::new();
    };
    let value = resolve_core(core, ctx);
    if value.is_empty() {
        String::new()
    } else {
        format!("{prefix}{value}{suffix}")
    }
}

fn resolve_core(inner: &str, ctx: &NameContext) -> String {
    let (name, spec) = match inner.split_once(':') {
        Some((n, s)) => (n, Some(s)),
        None => (inner, None),
    };
    // Normalize the token name: drop spaces/punctuation, lowercase, so
    // `{Movie Title}`, `{Movie.Title}` and `{movietitle}` are the same token.
    let key: String = name
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase();

    // Number tokens: an all-zeros spec is a zero-pad width (`00` => 2).
    let pad_width = spec
        .filter(|s| !s.is_empty() && s.chars().all(|c| c == '0'))
        .map(str::len)
        .unwrap_or(1);
    let pad = |n: u32| {
        if pad_width > 1 {
            format!("{n:0pad_width$}")
        } else {
            n.to_string()
        }
    };
    match key.as_str() {
        "season" | "seasonnumber" => return ctx.season.map(pad).unwrap_or_default(),
        "episode" | "episodenumber" => return ctx.episode.map(pad).unwrap_or_default(),
        "year" | "releaseyear" => return ctx.year.map(|y| y.to_string()).unwrap_or_default(),
        "tmdbid" => return ctx.tmdb_id.map(|x| x.to_string()).unwrap_or_default(),
        _ => {}
    }

    // MediaInfo language tokens honor the `:EN+DE` include / `-DE` exclude spec.
    match key.as_str() {
        "mediainfoaudiolanguages" => return langs(&ctx.audio_languages, spec, false),
        "mediainfoaudiolanguagesall" => return langs(&ctx.audio_languages, spec, true),
        "mediainfosubtitlelanguages" => return langs(&ctx.subtitle_languages, spec, true),
        _ => {}
    }

    // String tokens (a signed-integer spec truncates them to N bytes).
    let value = match key.as_str() {
        "title" | "movietitle" | "seriestitle" | "titleyear" => ctx.title.clone(),
        "cleantitle" | "moviecleantitle" | "seriescleantitle" => clean_title(&ctx.title),
        "titlethe" | "movietitlethe" | "seriestitlethe" => title_the(&ctx.title),
        "cleantitlethe" | "moviecleantitlethe" | "seriescleantitlethe" => {
            clean_title(&title_the(&ctx.title))
        }
        "titlefirstcharacter" | "movietitlefirstcharacter" | "seriestitlefirstcharacter" => {
            first_character(&ctx.title)
        }
        "episodetitle" => ctx.episode_title.clone().unwrap_or_default(),
        "quality" | "qualityfull" => ctx.quality_full(),
        "qualitytitle" => ctx.quality_title(),
        "resolution" => ctx.resolution.clone().unwrap_or_default(),
        "codec" | "videocodec" | "mediainfovideocodec" => ctx.codec.clone().unwrap_or_default(),
        "source" => ctx.source.clone().unwrap_or_default(),
        "releasegroup" => ctx.release_group.clone().unwrap_or_default(),
        "edition" | "editiontags" => ctx.edition.clone().unwrap_or_default(),
        "imdbid" => ctx.imdb_id.clone().unwrap_or_default(),
        "mediainfoaudiocodec" => ctx.audio_codec.clone().unwrap_or_default(),
        "mediainfoaudiochannels" => ctx.audio_channels.clone().unwrap_or_default(),
        "mediainfovideobitdepth" => ctx
            .video_bit_depth
            .map(|d| d.to_string())
            .unwrap_or_default(),
        "mediainfovideodynamicrange" | "mediainfovideodynamicrangetype" => {
            ctx.dynamic_range.clone().unwrap_or_default()
        }
        _ => String::new(),
    };

    match spec.and_then(|s| s.parse::<i32>().ok()) {
        Some(n) if n != 0 => truncate(&value, n),
        _ => value,
    }
}

// Render a `[EN+FR]` language tag with Radarr's include/exclude filter and the
// "hide a sole-English audio track" rule (footnote 2 in the token modal).
fn langs(all: &[String], spec: Option<&str>, keep_sole_english: bool) -> String {
    let mut list: Vec<String> = all.to_vec();
    match spec.filter(|s| !s.is_empty()) {
        Some(spec) => {
            let (mut include, mut exclude): (Vec<String>, Vec<String>) = (Vec::new(), Vec::new());
            for tok in spec.split('+') {
                match tok.strip_prefix('-') {
                    Some(x) if !x.is_empty() => exclude.push(x.to_uppercase()),
                    _ if !tok.is_empty() => include.push(tok.to_uppercase()),
                    _ => {}
                }
            }
            if !include.is_empty() {
                list.retain(|l| include.contains(l));
            }
            if !exclude.is_empty() {
                list.retain(|l| !exclude.contains(l));
            }
        }
        // No spec: hide the tag entirely when the only audio language is English.
        None if !keep_sole_english && list == ["EN"] => return String::new(),
        None => {}
    }
    if list.is_empty() {
        String::new()
    } else {
        format!("[{}]", list.join("+"))
    }
}

#[cfg(test)]
mod tests {
    use super::super::render;
    use super::*;

    fn ctx() -> NameContext {
        NameContext {
            title: "The Matrix".into(),
            year: Some(1999),
            resolution: Some("2160p".into()),
            codec: Some("x265".into()),
            source: Some("Bluray".into()),
            release_group: Some("EVOLVE".into()),
            edition: Some("IMAX".into()),
            imdb_id: Some("tt0133093".into()),
            tmdb_id: Some(603),
            audio_codec: Some("EAC3".into()),
            audio_channels: Some("5.1".into()),
            video_bit_depth: Some(10),
            dynamic_range: Some("DV".into()),
            audio_languages: vec!["EN".into(), "FR".into()],
            subtitle_languages: vec!["FR".into()],
            ..Default::default()
        }
    }

    #[test]
    fn radarr_tokens_render() {
        let c = ctx();
        assert_eq!(render("{Movie CleanTitle}", &c), "The Matrix");
        assert_eq!(render("{Movie TitleThe}", &c), "Matrix, The");
        assert_eq!(render("{ImdbId}", &c), "tt0133093");
        assert_eq!(render("{TmdbId}", &c), "603");
        assert_eq!(render("[{MediaInfo VideoCodec}]", &c), "[x265]");
        assert_eq!(
            render("{MediaInfo AudioCodec} {MediaInfo AudioChannels}", &c),
            "EAC3 5.1"
        );
        assert_eq!(render("{MediaInfo VideoDynamicRange}", &c), "DV");
        assert_eq!(render("{MediaInfo VideoBitDepth}bit", &c), "10bit");
        assert_eq!(render("{MediaInfo AudioLanguages}", &c), "[EN+FR]");
        assert_eq!(render("{MediaInfo SubtitleLanguages}", &c), "[FR]");
        assert_eq!(render("[{Edition Tags}]", &c), "[IMAX]");
        // In-brace decoration is emitted only when the token has a value.
        assert_eq!(
            render("{Movie Title}{-Release Group}", &c),
            "The Matrix-EVOLVE"
        );
        assert_eq!(
            render("{Movie Title}{[Quality Full]}", &c),
            "The Matrix[Bluray-2160p]"
        );
        let no_group = NameContext {
            release_group: None,
            ..c
        };
        assert_eq!(
            render("{Movie Title}{-Release Group}", &no_group),
            "The Matrix"
        );
    }

    #[test]
    fn quality_full_with_proper() {
        let c = NameContext {
            source: Some("Bluray".into()),
            resolution: Some("1080p".into()),
            proper: true,
            ..Default::default()
        };
        assert_eq!(render("{Quality Full}", &c), "Bluray-1080p Proper");
        assert_eq!(render("{Quality Title}", &c), "Bluray-1080p");
    }

    #[test]
    fn language_filter_and_sole_english() {
        let both = ["EN".to_string(), "FR".to_string()];
        assert_eq!(langs(&both, Some("FR"), false), "[FR]");
        assert_eq!(langs(&both, Some("-EN"), false), "[FR]");
        // Sole English is hidden for AudioLanguages but kept for AudioLanguagesAll.
        assert_eq!(langs(&["EN".to_string()], None, false), "");
        assert_eq!(langs(&["EN".to_string()], None, true), "[EN]");
    }

    #[test]
    fn number_token_without_pad_and_unknown_token() {
        let c = ctx();
        // No pad spec => plain number.
        assert_eq!(
            render(
                "S{season}",
                &NameContext {
                    season: Some(4),
                    ..Default::default()
                }
            ),
            "S4"
        );
        // Unknown token resolves to empty (and its decoration is dropped).
        assert_eq!(render("{Totally Unknown}", &c), "");
        assert_eq!(render("[{Totally Unknown}]", &c), "");
        // Year with no value renders empty.
        assert_eq!(render("{Release Year}", &NameContext::default()), "");
    }

    #[test]
    fn language_tokens_all_and_subtitle_spec() {
        // AudioLanguagesAll keeps a sole-English track (unlike AudioLanguages).
        let sole_en = NameContext {
            audio_languages: vec!["EN".into()],
            ..Default::default()
        };
        assert_eq!(render("{MediaInfo AudioLanguages}", &sole_en), "");
        assert_eq!(render("{MediaInfo AudioLanguagesAll}", &sole_en), "[EN]");
        // Subtitle languages honor an include+exclude spec.
        let subs = NameContext {
            subtitle_languages: vec!["EN".into(), "FR".into(), "DE".into()],
            ..Default::default()
        };
        assert_eq!(
            render("{MediaInfo SubtitleLanguages:EN+FR}", &subs),
            "[EN+FR]"
        );
        assert_eq!(
            render("{MediaInfo SubtitleLanguages:-EN}", &subs),
            "[FR+DE]"
        );
    }

    #[test]
    fn langs_include_and_exclude_together() {
        let all = ["EN".to_string(), "FR".to_string(), "DE".to_string()];
        // Include narrows, exclude then removes from the narrowed set.
        assert_eq!(langs(&all, Some("EN+FR+-FR"), true), "[EN]");
        // An empty filtered list yields no tag at all.
        assert_eq!(langs(&all, Some("JA"), true), "");
        // Empty spec is treated as no spec.
        assert_eq!(langs(&all, Some(""), true), "[EN+FR+DE]");
    }

    #[test]
    fn the_first_character_token_buckets_on_the_sort_title() {
        let c = NameContext {
            title: "The Matrix".into(),
            ..Default::default()
        };
        assert_eq!(
            render("{Movie Title First Character}/{Movie Title}", &c),
            "M/The Matrix"
        );

        let digits = NameContext {
            title: "2001: A Space Odyssey".into(),
            ..Default::default()
        };
        assert_eq!(render("{Title First Character}", &digits), "2");

        let punctuation = NameContext {
            title: "...And Justice for All".into(),
            ..Default::default()
        };
        assert_eq!(render("{Title First Character}", &punctuation), "A");

        let empty = NameContext {
            title: "!!!".into(),
            ..Default::default()
        };
        assert_eq!(render("{Title First Character}", &empty), "");
    }

    #[test]
    fn an_empty_language_filter_token_is_ignored() {
        let all = ["EN".to_string(), "FR".to_string(), "DE".to_string()];
        assert_eq!(langs(&all, Some("EN++FR"), true), "[EN+FR]");
        assert_eq!(langs(&all, Some("+"), true), "[EN+FR+DE]");
    }

    #[test]
    fn a_token_that_is_only_decoration_renders_empty_rather_than_panicking() {
        let c = ctx();

        assert_eq!(
            render("{Movie Title} { } {Release Year}", &c),
            "The Matrix 1999"
        );
        assert_eq!(render("{-}", &c), "");
        assert_eq!(render("{[]}", &c), "");
        assert_eq!(render("{...}", &c), "");
        assert_eq!(render("{}", &c), "");
    }

    #[test]
    fn string_token_truncation_spec() {
        let c = NameContext {
            title: "A Very Long Movie Title Here".into(),
            ..Default::default()
        };
        assert_eq!(render("{Movie Title:13}", &c), "A Very Lon...");
        // A zero spec is not a truncation (and not a pad): value unchanged.
        assert_eq!(
            render("{Movie Title:0}", &c),
            "A Very Long Movie Title Here"
        );
    }
}
