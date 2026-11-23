//! Plex-style filename / folder parsing.
//!
//! Decides whether a file is a movie or a TV episode, and pulls out the show
//! name, season, episode (incl. multi-episode files), titles and year using
//! the same cues Plex/Jellyfin rely on:
//!   * `S01E02`, `s1e2`, `S01E02-E03`, `1x02` season/episode markers
//!   * the folder a season folder vouches for as the *show* identity, and the
//!     filename when the path has no season folder to vouch for one (see
//!     [`show`])
//!   * `Movie Title (2017)` movie folders / filenames
//!   * release-junk stripping for clean titles (resolution, source, codec, group)
//!
//! This is pure domain logic: filename → parsed identity, no I/O.

mod marker;
mod show;
mod title;

use std::path::Path;

pub use marker::is_season_folder;
use marker::{Marker, find_loose_marker, find_marker, folder_season};
use title::clean_episode_title;
pub use title::{clean_title, parse_year};

/// Outcome of parsing one media file path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Parsed {
    Movie {
        title: String,
        year: Option<u32>,
    },
    Episode {
        show_title: String,
        show_year: Option<u32>,
        season: u32,
        episode: u32,
        episode_end: Option<u32>,
        episode_title: Option<String>,
    },
}

/// Parse a media file located at `path`, relative to its library `root`.
pub fn parse(root: &Path, path: &Path) -> Parsed {
    let file = Located::new(root, path);
    match find_marker(file.stem) {
        Some(marker) => file.episode(root, &marker),
        None => file.movie(),
    }
}

/// Parse a file of a library declared as shows, which holds no movie. Past the
/// markers [`parse`] reads, `S211E06`, an absolute `Episode 259` or `Ep. 259`
/// and a leading `215 - ` number name the episode, and a marker that names no
/// season takes the nearest season folder's, else season 1. `None` when the
/// name carries no episode number at all.
pub fn parse_episode(root: &Path, path: &Path) -> Option<Parsed> {
    let file = Located::new(root, path);
    let season = file
        .dirs
        .iter()
        .rev()
        .map(String::as_str)
        .find_map(folder_season)
        .unwrap_or(1);
    let marker = find_marker(file.stem).or_else(|| find_loose_marker(file.stem, season))?;
    Some(file.episode(root, &marker))
}

struct Located<'a> {
    stem: &'a str,
    dirs: Vec<String>,
}

impl<'a> Located<'a> {
    fn new(root: &Path, path: &'a Path) -> Self {
        let stem = path
            .file_stem()
            .and_then(std::ffi::OsStr::to_str)
            .unwrap_or("Untitled");
        let dirs = path
            .parent()
            .and_then(|p| p.strip_prefix(root).ok())
            .map(|rel| {
                rel.components()
                    .filter_map(|c| c.as_os_str().to_str())
                    .map(ToString::to_string)
                    .collect()
            })
            .unwrap_or_default();
        Self { stem, dirs }
    }

    fn episode(&self, root: &Path, m: &Marker) -> Parsed {
        let show = show::identify(root, &self.dirs, &self.stem[..m.start], self.stem);
        let after = self.stem.get(m.end..).unwrap_or("");
        let episode_title = Some(clean_episode_title(after)).filter(|t| !t.is_empty());
        Parsed::Episode {
            show_title: show.title,
            show_year: show.year,
            season: m.season,
            episode: m.episode,
            episode_end: m.episode_end,
            episode_title,
        }
    }

    fn movie(&self) -> Parsed {
        let parent = self.dirs.last().map(String::as_str);
        let (title, year) = if let Some(y) = parse_year(self.stem) {
            (clean_title(self.stem), Some(y))
        } else if let Some((p, y)) = parent.and_then(|p| parse_year(p).map(|y| (p, y))) {
            (clean_title(p), Some(y))
        } else {
            (clean_title(self.stem), None)
        };
        Parsed::Movie { title, year }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn p(root: &str, path: &str) -> Parsed {
        parse(Path::new(root), Path::new(path))
    }

    #[test]
    fn an_episode_under_a_bare_season_folder_falls_back_to_the_library_folder() {
        assert_eq!(
            p("/tv", "/tv/Season 01/S01E02.mkv"),
            Parsed::Episode {
                show_title: "tv".into(),
                show_year: None,
                season: 1,
                episode: 2,
                episode_end: None,
                episode_title: None,
            }
        );
    }

    #[test]
    fn a_movie_with_no_year_anywhere_keeps_the_filename_title() {
        assert_eq!(
            p("/m", "/m/Movies/Inception.mkv"),
            Parsed::Movie {
                title: "Inception".into(),
                year: None
            }
        );
    }

    #[test]
    fn movie_in_year_folder() {
        assert_eq!(
            p(
                "/m",
                "/m/Blade Runner 2049 (2017)/Blade Runner 2049 (2017) 2160p BluRay x265.mkv"
            ),
            Parsed::Movie {
                title: "Blade Runner 2049".into(),
                year: Some(2017)
            }
        );
    }

    #[test]
    fn movie_flat_dotted() {
        assert_eq!(
            p("/m", "/m/The.Matrix.1999.1080p.BluRay.x264-GROUP.mp4"),
            Parsed::Movie {
                title: "The Matrix".into(),
                year: Some(1999)
            }
        );
    }

    #[test]
    fn movie_title_from_folder_when_file_is_generic() {
        assert_eq!(
            p("/m", "/m/Inception (2010)/movie.mkv"),
            Parsed::Movie {
                title: "Inception".into(),
                year: Some(2010)
            }
        );
    }

    #[test]
    fn episode_show_season_layout() {
        assert_eq!(
            p(
                "/tv",
                "/tv/The Office (2005)/Season 02/The Office - S02E01 - The Dundies.mkv"
            ),
            Parsed::Episode {
                show_title: "The Office".into(),
                show_year: Some(2005),
                season: 2,
                episode: 1,
                episode_end: None,
                episode_title: Some("The Dundies".into()),
            }
        );
    }

    #[test]
    fn shows_grouped_under_one_folder_keep_their_own_identities() {
        let one = p("/lib", "/lib/Shows/Breaking Bad/Season 01/S01E01.mkv");
        let two = p("/lib", "/lib/Shows/The Office/Season 01/S01E02.mkv");

        assert!(
            matches!(one, Parsed::Episode { ref show_title, .. } if show_title == "Breaking Bad")
        );
        assert!(
            matches!(two, Parsed::Episode { ref show_title, .. } if show_title == "The Office")
        );
    }

    #[test]
    fn a_dump_folder_lets_each_filename_name_its_own_show() {
        let one = p("/lib", "/lib/all/Breaking.Bad.S01E01.1080p.mkv");
        let two = p("/lib", "/lib/all/The.Office.S01E01.1080p.mkv");

        assert!(
            matches!(one, Parsed::Episode { ref show_title, .. } if show_title == "Breaking Bad")
        );
        assert!(
            matches!(two, Parsed::Episode { ref show_title, .. } if show_title == "The Office")
        );
    }

    #[test]
    fn episodes_named_only_by_their_marker_land_in_one_series() {
        let one = p("/media/4k Shows", "/media/4k Shows/S01E01.mkv");
        let two = p("/media/4k Shows", "/media/4k Shows/S01E02.mkv");

        assert!(matches!(one, Parsed::Episode { ref show_title, .. } if show_title == "4k Shows"));
        assert!(matches!(two, Parsed::Episode { ref show_title, .. } if show_title == "4k Shows"));
    }

    #[test]
    fn episode_multi() {
        match p("/tv", "/tv/Show/Season 1/Show.S01E02-E03.mkv") {
            Parsed::Episode {
                season,
                episode,
                episode_end,
                ..
            } => {
                assert_eq!((season, episode, episode_end), (1, 2, Some(3)));
            }
            other => panic!("expected episode, got {other:?}"),
        }
    }

    #[test]
    fn episode_nxnn_flat() {
        match p("/tv", "/tv/Firefly - 1x02 - The Train Job.mkv") {
            Parsed::Episode {
                show_title,
                season,
                episode,
                ..
            } => {
                assert_eq!((show_title.as_str(), season, episode), ("Firefly", 1, 2));
            }
            other => panic!("expected episode, got {other:?}"),
        }
    }

    #[test]
    fn a_space_between_season_and_episode_reads_in_any_library() {
        let parsed = p("/tv", "/tv/Show/S01 E05 - Episode Title.mkv");

        assert!(matches!(
            parsed,
            Parsed::Episode { season: 1, episode: 5, ref episode_title, .. }
                if episode_title.as_deref() == Some("Episode Title")
        ));
    }

    #[test]
    fn an_absolute_episode_in_a_series_library_joins_its_show_folder() {
        let path = Path::new("/Shows/Example Series/Ep. 259.mp4");

        let parsed = parse_episode(Path::new("/Shows"), path);

        assert_eq!(
            parsed,
            Some(Parsed::Episode {
                show_title: "Example Series".into(),
                show_year: None,
                season: 1,
                episode: 259,
                episode_end: None,
                episode_title: None,
            })
        );
    }

    #[test]
    fn a_leading_number_under_a_season_folder_takes_that_season() {
        let path = Path::new("/Shows/Example Series/Season 2/215 - Episode Title.mp4");

        let parsed = parse_episode(Path::new("/Shows"), path);

        assert!(matches!(
            parsed,
            Some(Parsed::Episode { season: 2, episode: 215, ref show_title, ref episode_title, .. })
                if show_title == "Example Series" && episode_title.as_deref() == Some("Episode Title")
        ));
    }

    #[test]
    fn a_long_running_season_reads_in_a_series_library() {
        let path = Path::new("/Shows/Example Series/S211E06 - Episode Title.mkv");

        let parsed = parse_episode(Path::new("/Shows"), path);

        assert!(matches!(
            parsed,
            Some(Parsed::Episode {
                season: 211,
                episode: 6,
                ..
            })
        ));
    }

    #[test]
    fn a_series_library_leaves_out_a_name_with_no_episode_number() {
        let path = Path::new("/Shows/Example Series/Season 2/Episode Title.mp4");

        assert_eq!(parse_episode(Path::new("/Shows"), path), None);
    }

    #[test]
    fn any_other_library_still_reads_an_unmarked_name_as_a_movie() {
        assert!(matches!(p("/m", "/m/Ep. 259.mp4"), Parsed::Movie { .. }));
    }

    #[test]
    fn resolution_not_mistaken_for_episode() {
        // 1920x1080 must NOT parse as season 1920 / episode 1080.
        assert!(matches!(
            p("/m", "/m/Heat 1995 1920x1080.mkv"),
            Parsed::Movie { .. }
        ));
    }

    #[test]
    fn dictionary_words_survive_in_titles() {
        // "french"/"uncut" are release tags AND real words; the authoritative
        // `(YYYY)` boundary must win so the title is not clipped at them.
        assert_eq!(
            clean_title("The French Dispatch (2021) [EN+FR] Bluray-1080p"),
            "The French Dispatch"
        );
        assert_eq!(clean_title("Uncut Gems (2019) WEBDL-1080p"), "Uncut Gems");
        // Bare-year layout, still must keep the dictionary word.
        assert_eq!(
            clean_title("The French Connection 1971 1080p BluRay"),
            "The French Connection"
        );
    }

    #[test]
    fn french_dub_tag_stripped_when_adjacent_to_junk() {
        // No year: FRENCH sits right before a hard marker → both drop.
        assert_eq!(
            clean_title("Le Fabuleux Destin FRENCH DVDRip XviD"),
            "Le Fabuleux Destin"
        );
    }

    #[test]
    fn leading_year_recovers_title() {
        // A year at the start must not wipe the whole title to "".
        assert_eq!(
            clean_title("2018 - LaserGame - Indian Forest"),
            "LaserGame - Indian Forest"
        );
    }

    #[test]
    fn the_french_dispatch_parses_with_year() {
        assert_eq!(
            p(
                "/m",
                "/m/The French Dispatch (2021)/The French Dispatch (2021) [EN+FR] Bluray-1080p.mkv"
            ),
            Parsed::Movie {
                title: "The French Dispatch".into(),
                year: Some(2021)
            }
        );
    }
}
