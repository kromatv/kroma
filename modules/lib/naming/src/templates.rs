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
    /// core's `Settings::get_str` and a module's `HostCtx::setting_str`. One
    /// reader rather than one per seam, because two would drift and the same file
    /// would then be named differently depending on which side imported it.
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

    /// `<season folder>/<episode file>.<ext>`: the part of
    /// [`Self::episode_rel_path`] below the series folder, for an episode that
    /// joins a series already on disk. Just the file when the season template is
    /// empty.
    pub fn episode_path_in_series(&self, ctx: &NameContext, ext: &str) -> PathBuf {
        let file = file_component(&self.styled(&self.episode_file, ctx), ext);
        match sanitize(&self.styled(&self.season_folder, ctx)) {
            folder if folder.is_empty() => PathBuf::from(file),
            folder => PathBuf::from(folder).join(file),
        }
    }
}

#[cfg(test)]
mod tests;
