//! Where an episode lands when the library already holds its series: in the
//! folder that series lives in, whatever title the grab was made under. A
//! folder named after the request instead would be scanned as a second show.

use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use anyhow::Result;

use kroma_module_sdk::db;
use kroma_module_sdk::domain::naming::is_season_folder;
use kroma_module_sdk::domain::RequestKind;
use kroma_module_sdk::host::{HostStorage, LibraryFolders};
use kroma_naming::{NameContext, NamingTemplates};

pub(super) struct SeriesHome {
    dir: PathBuf,
    seasons: BTreeMap<u32, PathBuf>,
}

impl SeriesHome {
    pub(super) fn find<S: HostStorage>(
        state: &S,
        tmdb_id: Option<u64>,
        lib: &LibraryFolders,
    ) -> Result<Option<Self>> {
        let Some(tmdb_id) = tmdb_id else {
            return Ok(None);
        };
        let roots: Vec<PathBuf> = lib
            .folders
            .iter()
            .map(|f| PathBuf::from(super::canonical(f)))
            .collect();
        let conn = state.db().get()?;
        let files = db::title_files(&conn, RequestKind::Show, tmdb_id)?;
        drop(conn);
        let held = files.iter().filter_map(|f| {
            let path = Path::new(f.file.abs_path.as_deref()?);
            let root = roots.iter().find(|r| path.starts_with(r))?;
            HeldEpisode::at(root, path, f.season?)
        });
        Ok(Self::from_held(held))
    }

    fn from_held(held: impl Iterator<Item = HeldEpisode>) -> Option<Self> {
        let held: Vec<HeldEpisode> = held.collect();
        let dir = most_common(held.iter().map(|h| &h.series_dir))?.clone();
        let mut by_season: BTreeMap<u32, Vec<&PathBuf>> = BTreeMap::new();
        for h in held.iter().filter(|h| h.series_dir == dir) {
            if let Some(folder) = &h.season_dir {
                by_season.entry(h.season).or_default().push(folder);
            }
        }
        let seasons = by_season
            .into_iter()
            .filter_map(|(season, folders)| {
                Some((season, most_common(folders.into_iter())?.clone()))
            })
            .collect();
        Some(Self { dir, seasons })
    }

    fn place(&self, in_series: &Path, season: u32) -> Option<PathBuf> {
        let file = in_series.file_name()?;
        let season_dir = match self.seasons.get(&season) {
            Some(dir) => dir.clone(),
            None => self
                .dir
                .join(in_series.parent().filter(|p| !p.as_os_str().is_empty())?),
        };
        Some(season_dir.join(file))
    }
}

pub(super) fn episode_dest(
    tpl: &NamingTemplates,
    home: Option<&SeriesHome>,
    lib_root: &Path,
    ctx: &NameContext,
    ext: &str,
) -> PathBuf {
    home.zip(ctx.season)
        .and_then(|(home, season)| home.place(&tpl.episode_path_in_series(ctx, ext), season))
        .unwrap_or_else(|| lib_root.join(tpl.episode_rel_path(ctx, ext)))
}

struct HeldEpisode {
    series_dir: PathBuf,
    season_dir: Option<PathBuf>,
    season: u32,
}

impl HeldEpisode {
    fn at(root: &Path, file: &Path, season: u32) -> Option<Self> {
        let parent = file.parent()?;
        let mut series_dir = parent;
        while series_dir
            .file_name()
            .and_then(OsStr::to_str)
            .is_some_and(is_season_folder)
        {
            series_dir = series_dir.parent()?;
        }
        if series_dir == root || !series_dir.starts_with(root) {
            return None;
        }
        Some(Self {
            series_dir: series_dir.to_path_buf(),
            season_dir: (series_dir != parent).then(|| parent.to_path_buf()),
            season,
        })
    }
}

fn most_common<'a>(paths: impl Iterator<Item = &'a PathBuf>) -> Option<&'a PathBuf> {
    let mut counts: BTreeMap<&PathBuf, usize> = BTreeMap::new();
    for p in paths {
        *counts.entry(p).or_default() += 1;
    }
    let top = counts.values().copied().max()?;
    counts.into_iter().find(|(_, n)| *n == top).map(|(p, _)| p)
}

#[cfg(test)]
mod tests;
