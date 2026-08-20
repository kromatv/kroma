//! The five path templates an admin configures, the casing they render in, and
//! the library-relative paths they produce.

use std::path::PathBuf;

use crate::engine::services::settings::Settings;

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

    fn store() -> (kroma_db::testing::TempPool, Settings) {
        let pool = kroma_db::testing::temp_pool("naming");
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
        let host = settings_host(pool.clone(), settings);
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
        let host = settings_host(pool.clone(), settings);
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
