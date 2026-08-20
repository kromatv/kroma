//! Sonarr/Radarr-style file naming: render a path template against a title's
//! facts. Unknown tokens render empty; the token vocabulary lives in [`tokens`].
//!
//! A library and not an extension point: this renders one path per imported
//! file, so reaching it over a localhost round trip would be slower than the code
//! it replaced. It names no host and no module, and takes its templates as an
//! argument, so the core and a sidecar read them through whatever settings seam
//! each of them holds.

mod casing;
mod labels;
mod templates;
mod title;
mod tokens;
mod truncate;

pub use casing::*;
pub use labels::*;
pub use templates::*;

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
    fn render_cleans_empty_delimiters() {
        let ctx = NameContext { title: "Show".into(), ..Default::default() };
        assert_eq!(render("{Movie Title} ({Release Year})", &ctx), "Show");
        assert_eq!(render("{Movie Title} [{Resolution}]", &ctx), "Show");
        assert_eq!(render("{Movie Title} ({Release Year}) [{Resolution}]", &ctx), "Show");
        assert_eq!(render("{Movie Title} - {Episode Title} - {Resolution}", &ctx), "Show");
        assert_eq!(render("({Release Year})", &NameContext::default()), "");
    }
}
