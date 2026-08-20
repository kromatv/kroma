//! The five path templates an admin configures, the casing they render in, and
//! the library-relative paths they produce.

use std::path::PathBuf;

use super::casing::Casing;
use super::{file_component, render, sanitize, NameContext};

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
    /// Read the templates through whatever settings seam the caller holds:
    /// `setting` is `(key, default) -> value`, which is the shape of both the
    /// core's `Settings::get_str` and a sidecar's `HostCtx::setting_str`. One
    /// reader rather than one per seam, because two would drift and the same file
    /// would then be named differently depending on which process imported it.
    ///
    /// A template an admin blanked falls back to its default: an empty template
    /// renders empty, so every import would land on one path and overwrite the
    /// last.
    pub fn read(setting: impl Fn(&str, &str) -> String) -> Self {
        let g = |key: &str, default: &str| {
            let v = setting(key, default);
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

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

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

    // The spellings the core's settings store registers for these keys
    // (`kroma_engine::services::settings::store`). They are ALIASES of the
    // constants above: a server that never touched the settings has to name a
    // file the same way either default would, and the test below pins that.
    fn registered() -> HashMap<String, String> {
        HashMap::from([
            ("namingMovieFolder".to_string(), "{Title} ({Year})".to_string()),
            ("namingMovieFile".to_string(), "{Title} ({Year}) {Quality Full}".to_string()),
            ("namingSeriesFolder".to_string(), "{Title} ({Year})".to_string()),
            ("namingSeasonFolder".to_string(), "Season {season:00}".to_string()),
            (
                "namingEpisodeFile".to_string(),
                "{Title} - S{season:00}E{episode:00} - {Episode Title} {Quality Full}".to_string(),
            ),
        ])
    }

    // A settings seam, in the shape every caller's really is: a stored value when
    // there is one, the caller's default otherwise.
    fn reader(stored: HashMap<String, String>) -> impl Fn(&str, &str) -> String {
        move |key: &str, default: &str| {
            stored.get(key).cloned().unwrap_or_else(|| default.to_string())
        }
    }

    #[test]
    fn an_unconfigured_server_names_files_the_same_way_either_default_would() {
        let from_store = NamingTemplates::read(reader(registered()));
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
        let mut blanked = registered();
        for value in blanked.values_mut() {
            *value = "   ".to_string();
        }

        let cleared = NamingTemplates::read(reader(blanked));
        let fresh = NamingTemplates::read(reader(registered()));

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
        let mut stored = registered();
        stored.insert("namingMovieFolder".into(), "{Movie Title}".into());
        stored.insert("namingCase".into(), "lower".into());

        let t = NamingTemplates::read(reader(stored));

        assert_eq!(t.movie_folder, "{Movie Title}");
        let path = t.movie_rel_path(&movie_ctx(), "mkv");
        assert!(path.starts_with("the matrix"), "{path:?}");
    }
}
