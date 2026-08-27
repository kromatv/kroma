//! Working out which title a download is for.

use kroma_module_sdk::host::HostCtx;

use crate::db::{self, DownloadLink};
use crate::MatchSource;

use super::DownloadManager;

/// Below this the release name told us nothing useful and a wrong poster is
/// worse than none. Deliberately above the catalog's own accept cutoff: a
/// download can be corrected in one click, but only if it is obvious it is
/// wrong.
const MIN_CONFIDENCE: f32 = 0.55;

/// What the release name says, in the shape the ledger stores.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseShape {
    /// `movie` | `season` | `episode`.
    pub kind: String,
    pub title: String,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
}

/// Read a scene release name into the fields a download row carries.
pub fn shape_of(release_title: &str) -> ReleaseShape {
    let parsed = kroma_scene::parse_release_name(release_title);
    let kind = match (parsed.season, parsed.episode) {
        (Some(_), Some(_)) => "episode",
        (Some(_), None) => "season",
        _ => "movie",
    };
    let episodes = parsed.episode.map(|first| match parsed.episode_end {
        Some(last) if last > first => (first..=last).collect(),
        _ => vec![first],
    });
    ReleaseShape {
        kind: kind.to_string(),
        title: parsed.title,
        year: parsed.year,
        season: parsed.season,
        episodes,
    }
}

impl DownloadManager {
    /// Resolve an unlinked row to a title and pin it, if anything is confident
    /// enough. A no-op for a row that already names a title, an operator has
    /// corrected, or whose release name reads as nothing.
    pub fn auto_link(&self, host: &dyn HostCtx, id: &str) {
        let Ok(conn) = self.core().get() else { return };
        let Ok(Some(row)) = db::get_download(&conn, id) else {
            return;
        };
        drop(conn);
        if row.tmdb_id.is_some() || row.match_source == Some(MatchSource::Pinned) {
            return;
        }
        let shape = shape_of(&row.release_title);
        if shape.title.trim().is_empty() {
            return;
        }
        let candidates = host.metadata_candidates(&shape.title, &shape.kind, shape.year);
        let Some(best) = candidates
            .into_iter()
            .find(|c| c.score >= MIN_CONFIDENCE)
        else {
            tracing::info!(
                release = %row.release_title,
                parsed = %shape.title,
                "no confident title for this download; left for an operator to link"
            );
            let _ = db::mark_download_match_tried(self.core(), id);
            return;
        };
        let link = DownloadLink {
            kind: shape.kind,
            tmdb_id: best.tmdb_id,
            title: Some(best.title.clone()),
            year: best.year.or(shape.year),
            season: shape.season,
            episodes: shape.episodes,
            source: MatchSource::Auto,
        };
        match db::link_download(self.core(), id, &link) {
            Ok(true) => tracing::info!(
                release = %row.release_title,
                title = %best.title,
                score = best.score,
                "download linked automatically"
            ),
            Ok(false) => {}
            Err(e) => {
                tracing::warn!(id, error = %format!("{e:#}"), "linking the download failed")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_release_name_reads_as_the_shape_the_ledger_stores() {
        let episode = shape_of("Stuart.Fails.to.Save.the.Universe.S01E04.MULTi.1080p.WEB-BYOR");
        let season = shape_of("Pluribus.S01.MULTi.VFF.1080p.WEBrip.x265-TyHD");
        let movie = shape_of("Dune.Part.Two.2024.MULTi.1080p.BluRay.x265-GROUP");

        assert_eq!(episode.kind, "episode");
        assert_eq!(episode.title, "Stuart Fails to Save the Universe");
        assert_eq!(episode.episodes, Some(vec![4]));
        assert_eq!(season.kind, "season");
        assert_eq!(season.season, Some(1));
        assert_eq!(season.episodes, None);
        assert_eq!(movie.kind, "movie");
        assert_eq!(movie.year, Some(2024));
    }

    #[test]
    fn an_episode_range_reads_as_every_episode_in_the_pack() {
        let shape = shape_of("Show.Name.S02E01-E03.1080p.WEB");

        assert_eq!(shape.episodes, Some(vec![1, 2, 3]));
    }
}
