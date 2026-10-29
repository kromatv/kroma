use std::path::Path;

use crate::db::{self, Pool};
use crate::infra::metadata::Target;
use crate::model::{Kind, MediaItem, Metadata, Show};
use crate::state::SharedState;

use super::episodes::art_gone;

pub(super) struct Job {
    pub(super) id: String,
    pub(super) target: Target,
    pub(super) title: String,
    pub(super) year: Option<u32>,
    pub(super) is_show: bool,
    // Set means "already enriched": skip the rate-limited title re-lookup.
    pub(super) resolved_tmdb: Option<u64>,
    // Set means "fetch THIS id" (operator correction or acquisition import);
    // checked before `resolved_tmdb` and always performs the detail fetch.
    pub(super) pin: Option<u64>,
    // Set means "fetch the id on file again": its cached art was cleared from
    // disk, and the same URLs hash to the same names, so a fresh fetch brings
    // every stored reference back. Unlike a pin it is not a correction, so it
    // never renames the row.
    pub(super) refetch: Option<u64>,
}

impl Job {
    // A settled movie's only remaining call is for a language added since, which
    // the nightly `pipeline.metadata` stage is what notices. A show always has
    // one: a season added since the last pass is only filled in from here.
    pub(super) const fn fetches(&self) -> bool {
        self.is_show || self.resolved_tmdb.is_none()
    }
}

pub(super) fn build_jobs(
    items: &[MediaItem],
    shows: &[Show],
    pins: &Pins,
    data_dir: &Path,
) -> Vec<Job> {
    let mut jobs: Vec<Job> = Vec::new();
    for i in items {
        if !matches!(i.kind, Kind::Movie | Kind::Video) {
            continue;
        }
        let on_file = i.metadata.as_ref().map(|m| m.tmdb_id).filter(|&id| id != 0);
        let pin = pins.items.get(&i.id).copied();
        // A pin that disagrees with the id on file is a correction that has not
        // landed yet, so it re-matches even though the movie looks done.
        let settled = on_file.is_some() && (pin.is_none() || pin == on_file);
        let intact = art_intact(data_dir, i.metadata.as_ref());
        jobs.push(Job {
            id: i.id.clone(),
            target: Target::Movie,
            title: i.title.clone(),
            year: i.year,
            is_show: false,
            // Enqueued even when already enriched, as a show is: carrying the
            // id it resolved to means no search and no chance of landing on a
            // different film, and it is the only way a language added since is
            // ever noticed outside the nightly stage.
            resolved_tmdb: on_file.filter(|_| settled && intact),
            pin,
            refetch: on_file.filter(|_| settled && !intact),
        });
    }
    for s in shows {
        // Enqueued even when already enriched: a show may have gained a season,
        // and `enrich_episodes` fills only the new stills/cast.
        let on_file = s.metadata.as_ref().map(|m| m.tmdb_id).filter(|&id| id != 0);
        let pin = pins.shows.get(&s.id).copied();
        let settled = pin.is_none() || pin == on_file;
        let intact = art_intact(data_dir, s.metadata.as_ref());
        jobs.push(Job {
            id: s.id.clone(),
            target: Target::Tv,
            title: s.title.clone(),
            year: s.year,
            is_show: true,
            resolved_tmdb: on_file.filter(|_| settled && intact),
            pin: pin.filter(|&p| Some(p) != on_file),
            refetch: on_file.filter(|_| settled && !intact),
        });
    }
    jobs
}

pub(super) fn art_intact(data_dir: &Path, meta: Option<&Metadata>) -> bool {
    meta.is_none_or(|m| {
        let urls = [&m.poster_url, &m.backdrop_url, &m.logo_url];
        !art_gone(data_dir, urls.into_iter().map(Option::as_deref))
    })
}

#[derive(Default)]
pub(super) struct Pins {
    pub(super) items: std::collections::HashMap<String, u64>,
    pub(super) shows: std::collections::HashMap<String, u64>,
}

pub(super) fn pin_for(state: &SharedState, kind: &str, id: &str) -> Option<u64> {
    let conn = state.db.get().ok()?;
    if let Some(p) = db::tmdb_pin::get(&conn, kind, id).ok().flatten() {
        return Some(p);
    }
    if kind == db::metadata_core::SHOW {
        db::acq_tmdb_for_show(&conn, id).ok().flatten()
    } else {
        db::acq_tmdb_for_item(&conn, id).ok().flatten()
    }
}

pub(super) fn load_pins(pool: &Pool) -> Pins {
    // Acquisition hints first, then operator corrections: the operator wins.
    let mut items = db::acq_tmdb_by_item(pool).unwrap_or_default();
    let mut shows = db::acq_tmdb_by_show(pool).unwrap_or_default();
    items.extend(db::tmdb_pin::all_for_kind(pool, db::metadata_core::ITEM).unwrap_or_default());
    shows.extend(db::tmdb_pin::all_for_kind(pool, db::metadata_core::SHOW).unwrap_or_default());
    Pins { items, shows }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::image;

    fn movie_with(id: &str, tmdb: u64) -> MediaItem {
        MediaItem {
            id: id.into(),
            title: "Dune".into(),
            kind: Kind::Movie,
            year: None,
            duration_ms: None,
            container: String::new(),
            video: None,
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            library: "lib".into(),
            show_id: None,
            show_title: None,
            season: None,
            episode: None,
            episode_end: None,
            episode_title: None,
            rel_path: None,
            added_at: String::new(),
            metadata: (tmdb != 0).then(|| Metadata {
                provider: "tmdb",
                tmdb_id: tmdb,
                imdb_id: None,
                title: None,
                tagline: None,
                overview: None,
                release_date: None,
                genres: Vec::new(),
                tmdb_genre_ids: Vec::new(),
                rating: None,
                certification: None,
                poster_url: None,
                backdrop_url: None,
                logo_url: None,
                theme_url: None,
                cast: Vec::new(),
                crew: Vec::new(),
                keywords: Vec::new(),
                tvdb_id: None,
                tmdb_url: String::new(),
            }),
            abs_path: None,
            files: Vec::new(),
            editions: Vec::new(),
            default_file_id: None,
            markers: Vec::new(),
            audio_analysis: None,
        }
    }

    fn data_dir() -> kroma_testing::TempDir {
        kroma_testing::temp_dir("enrich-jobs")
    }

    #[test]
    fn a_movie_already_matched_still_enters_the_queue_carrying_its_id() {
        let dir = data_dir();

        let jobs = build_jobs(&[movie_with("m1", 603)], &[], &Pins::default(), dir.path());

        let job = jobs.iter().find(|j| j.id == "m1").expect("the movie");
        assert_eq!(job.resolved_tmdb, Some(603));
        assert_eq!(job.refetch, None);
    }

    #[test]
    fn a_movie_that_never_matched_is_queued_to_be_matched() {
        let dir = data_dir();

        let jobs = build_jobs(&[movie_with("m1", 0)], &[], &Pins::default(), dir.path());

        let job = jobs.iter().find(|j| j.id == "m1").expect("the movie");
        assert_eq!(job.resolved_tmdb, None);
    }

    #[test]
    fn a_pin_that_disagrees_with_the_id_on_file_re_matches() {
        let dir = data_dir();
        let mut pins = Pins::default();
        pins.items.insert("m1".into(), 999);

        let jobs = build_jobs(&[movie_with("m1", 603)], &[], &pins, dir.path());

        let job = jobs.iter().find(|j| j.id == "m1").expect("the movie");
        assert_eq!(job.resolved_tmdb, None);
        assert_eq!(job.pin, Some(999));
    }

    #[test]
    fn a_movie_whose_cached_art_was_cleared_is_fetched_again_by_id() {
        let dir = data_dir();
        let mut movie = movie_with("m1", 603);
        movie.metadata.as_mut().unwrap().poster_url = Some("/api/images/gone.webp".into());

        let jobs = build_jobs(&[movie], &[], &Pins::default(), dir.path());

        let job = jobs.iter().find(|j| j.id == "m1").expect("the movie");
        assert_eq!(job.resolved_tmdb, None);
        assert_eq!(job.pin, None);
        assert_eq!(job.refetch, Some(603));
    }

    #[test]
    fn a_movie_that_matched_and_kept_its_art_is_left_to_the_nightly_sweep() {
        let dir = data_dir();

        let jobs = build_jobs(&[movie_with("m1", 603)], &[], &Pins::default(), dir.path());

        assert!(!jobs[0].fetches());
    }

    #[test]
    fn a_movie_with_nothing_on_file_a_pin_or_cleared_art_is_fetched_after_a_scan() {
        let dir = data_dir();
        let mut pins = Pins::default();
        pins.items.insert("m2".into(), 999);
        let mut cleared = movie_with("m3", 603);
        cleared.metadata.as_mut().unwrap().poster_url = Some("/api/images/gone.webp".into());

        let jobs = build_jobs(
            &[movie_with("m1", 0), movie_with("m2", 603), cleared],
            &[],
            &pins,
            dir.path(),
        );

        assert!(jobs.iter().all(Job::fetches), "{}", jobs.len());
    }

    #[test]
    fn a_show_is_always_fetched_so_a_season_added_since_gets_its_stills() {
        let dir = data_dir();
        let show = Show {
            id: "s1".into(),
            title: "Breaking Bad".into(),
            year: None,
            library: "lib".into(),
            season_count: 1,
            episode_count: 1,
            video: None,
            added_at: String::new(),
            metadata: movie_with("x", 1396).metadata,
            progress: None,
        };

        let jobs = build_jobs(&[], &[show], &Pins::default(), dir.path());

        assert!(jobs[0].fetches());
    }

    #[test]
    fn a_movie_whose_cached_art_is_on_disk_stays_settled() {
        let dir = data_dir();
        let images = image::images_dir(dir.path());
        std::fs::create_dir_all(&images).unwrap();
        std::fs::write(images.join("here.webp"), b"x").unwrap();
        let mut movie = movie_with("m1", 603);
        movie.metadata.as_mut().unwrap().poster_url = Some("/api/images/here.webp".into());

        let jobs = build_jobs(&[movie], &[], &Pins::default(), dir.path());

        let job = jobs.iter().find(|j| j.id == "m1").expect("the movie");
        assert_eq!(job.resolved_tmdb, Some(603));
        assert_eq!(job.refetch, None);
    }
}
