use std::time::{Duration, Instant};

use anyhow::Result;

use crate::db::{self, Covers, DownloadRow};

use super::DownloadManager;

// How long a start waits for a pack's file list before it claims no episode. The
// whole start gets twenty five seconds, of which an indexer sweep is most.
const FILES_WITHIN: Duration = Duration::from_secs(10);
const LOOK_AGAIN_AFTER: Duration = Duration::from_millis(250);

pub struct Asked<'a> {
    pub kind: &'a str,
    pub tmdb_id: u64,
    pub client_id: &'a str,
    pub episode: Option<(u32, u32)>,
}

enum Holds {
    Yes,
    No,
    NoFileListYet,
}

impl DownloadManager {
    /// The newest live download that can really answer for `asked`, or `None` for
    /// a start that has to find its own release. A season pack answers only for an
    /// episode its own files hold, and one whose file list has not arrived waits
    /// for it: guessing yes plays the wrong episode, guessing no grabs the pack
    /// twice. Blocking, like everything else on the manager.
    pub fn live_for_title(&self, asked: Asked<'_>) -> Result<Option<DownloadRow>> {
        self.live_within(asked, FILES_WITHIN)
    }

    fn live_within(&self, asked: Asked<'_>, within: Duration) -> Result<Option<DownloadRow>> {
        let live =
            db::live_downloads_for_title(&*self.core().get()?, asked.tmdb_id, asked.client_id)?;
        let mut packs = Vec::new();
        for row in live {
            match db::covers(&row, asked.kind, asked.episode) {
                Covers::Yes => return Ok(Some(row)),
                Covers::No => {}
                Covers::IfItsFilesHold(episode) => packs.push((row, episode)),
            }
        }
        Ok(self.first_holding(&packs, within))
    }

    fn first_holding(&self, packs: &[(DownloadRow, u32)], within: Duration) -> Option<DownloadRow> {
        let until = Instant::now() + within;
        loop {
            let mut resolving = false;
            for (row, episode) in packs {
                match self.holds_episode(row, *episode) {
                    Holds::Yes => return Some(row.clone()),
                    Holds::No => {}
                    Holds::NoFileListYet => resolving = true,
                }
            }
            if !resolving || Instant::now() >= until {
                return None;
            }
            std::thread::sleep(LOOK_AGAIN_AFTER);
        }
    }

    fn holds_episode(&self, row: &DownloadRow, episode: u32) -> Holds {
        let files = self.video_files(&row.client_ref);
        if files.is_empty() {
            return Holds::NoFileListYet;
        }
        let held = files.iter().any(|file| {
            file.episode == Some(episode)
                && file.season.is_none_or(|season| Some(season) == row.season)
        });
        match held {
            true => Holds::Yes,
            false => Holds::No,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{added, manager_over, offering_pack};
    use super::*;

    fn pack(id: &str, season: u32) -> DownloadRow {
        DownloadRow {
            kind: "season".into(),
            season: Some(season),
            tmdb_id: Some(42),
            ..added(id)
        }
    }

    fn asked(episode: u32) -> Asked<'static> {
        Asked {
            kind: "show",
            tmdb_id: 42,
            client_id: "embedded",
            episode: Some((1, episode)),
        }
    }

    #[test]
    fn a_pack_answers_for_an_episode_its_files_hold_and_never_for_one_they_do_not() {
        let (_host, manager) = manager_over("torrents-reuse-holds", &[pack("p1", 1)]);
        offering_pack(&manager, "deadbeef", 1, &[1, 2]);

        let answered = [1, 2, 3].map(|episode| {
            manager
                .live_within(asked(episode), Duration::ZERO)
                .unwrap()
                .map(|row| row.id)
        });

        assert_eq!(
            answered,
            [Some("p1".to_string()), Some("p1".to_string()), None]
        );
    }

    #[test]
    fn a_pack_whose_swarm_has_not_answered_with_its_files_claims_no_episode() {
        let (_host, manager) = manager_over("torrents-reuse-unresolved", &[pack("p1", 1)]);

        let answered = manager.live_within(asked(3), Duration::ZERO).unwrap();

        assert!(answered.is_none());
    }

    #[test]
    fn a_pack_of_another_season_answers_for_nothing_in_this_one() {
        let (_host, manager) = manager_over("torrents-reuse-season", &[pack("p2", 2)]);
        offering_pack(&manager, "deadbeef", 2, &[1, 2, 3]);

        let answered = manager.live_within(asked(3), Duration::ZERO).unwrap();

        assert!(answered.is_none());
    }

    #[test]
    fn a_film_is_answered_by_its_own_kind_without_asking_for_any_file() {
        let film = DownloadRow {
            tmdb_id: Some(42),
            ..added("d1")
        };
        let (_host, manager) = manager_over("torrents-reuse-film", &[film]);

        let answered = manager
            .live_within(
                Asked {
                    kind: "movie",
                    tmdb_id: 42,
                    client_id: "embedded",
                    episode: None,
                },
                Duration::ZERO,
            )
            .unwrap();

        assert_eq!(answered.map(|row| row.id), Some("d1".to_string()));
    }
}
