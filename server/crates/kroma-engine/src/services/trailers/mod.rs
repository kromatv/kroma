//! Trailers, the core's half. Whichever module answers the `trailer` point
//! fetches a title's YouTube trailer into one MP4; the core keeps the finished
//! file under `<data>/trailers`, serves it like any media file, and evicts the
//! least recently played past a size cap. A trailer that played once keeps
//! playing when YouTube changes something, until it is evicted.

mod point;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;

use kroma_module_host::Resolver;

pub use point::POINT;

const MAX_PREPARING: usize = 3;
const CAP_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const RETRY_FAILED_AFTER: Duration = Duration::from_secs(2 * 60);
const OFFERED_FOR: Duration = Duration::from_secs(24 * 60 * 60);

/// Where a trailer stands for a viewer who asked to play it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Preparation {
    Ready,
    Preparing,
    Failed,
}

enum Job {
    Preparing,
    Failed(Instant),
}

/// The trailer cache: one finished MP4 per YouTube video id.
pub struct Trailers {
    dir: PathBuf,
    cap_bytes: u64,
    jobs: Mutex<HashMap<String, Job>>,
    offered: Mutex<HashMap<(String, String), Instant>>,
}

/// The two-letter language a preference names, whatever form it was stored in
/// (`fre`, `fr-CA`, `fr`). `None` for an empty one.
pub fn spoken_language(tag: &str) -> Option<String> {
    let base = tag.split(['-', '_']).next()?.trim().to_ascii_lowercase();
    if base.is_empty() {
        return None;
    }
    Some(kroma_primitives::language::language_code(&base).map_or(base, str::to_string))
}

/// Whether `video` is a YouTube video id, which also makes it a safe file name.
pub fn is_video_id(video: &str) -> bool {
    video.len() == 11
        && video
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

impl Trailers {
    /// A cache in `dir`, holding at most `cap_bytes`. A fetch a crash cut short
    /// is cleared.
    pub fn new(dir: PathBuf, cap_bytes: u64) -> Self {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if entry.path().extension().is_some_and(|ext| ext == "part") {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
        Self {
            dir,
            cap_bytes,
            jobs: Mutex::new(HashMap::new()),
            offered: Mutex::new(HashMap::new()),
        }
    }

    /// The cache a server keeps: `<data>/trailers`, at most 4 GiB.
    pub fn in_data_dir(data_dir: &Path) -> Self {
        Self::new(data_dir.join("trailers"), CAP_BYTES)
    }

    /// Remember that `title`'s list offered `videos`, so any of them may be
    /// prepared for the next day whatever language the viewer then asks in.
    pub fn offer(&self, title: &str, videos: impl IntoIterator<Item = String>) {
        let now = Instant::now();
        let mut offered = self
            .offered
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        offered.retain(|_, at| now.duration_since(*at) < OFFERED_FOR);
        for video in videos {
            offered.insert((title.to_string(), video), now);
        }
    }

    /// Whether a list offered `video` for `title` within the last day.
    pub fn offered(&self, title: &str, video: &str) -> bool {
        let offered = self
            .offered
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        offered
            .get(&(title.to_string(), video.to_string()))
            .is_some_and(|at| at.elapsed() < OFFERED_FOR)
    }

    fn path(&self, video: &str) -> PathBuf {
        self.dir.join(format!("{video}.mp4"))
    }

    /// The finished file for `video`, marked as just played so eviction keeps
    /// it longest.
    pub fn file(&self, video: &str) -> Option<PathBuf> {
        if !is_video_id(video) {
            return None;
        }
        let path = self.path(video);
        let file = fs::File::options().append(true).open(&path).ok()?;
        let _ = file.set_modified(SystemTime::now());
        Some(path)
    }

    /// Where `video` stands, starting its fetch when nothing has yet. A fetch
    /// that failed is not tried again for a couple of minutes, so a viewer
    /// pressing play again does not hammer a source that just refused.
    pub fn prepare(self: &Arc<Self>, video: &str, resolve: Resolver) -> Preparation {
        if !is_video_id(video) {
            return Preparation::Failed;
        }
        if self.path(video).exists() {
            return Preparation::Ready;
        }
        let mut jobs = self
            .jobs
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        match jobs.get(video) {
            Some(Job::Preparing) => return Preparation::Preparing,
            Some(Job::Failed(at)) if at.elapsed() < RETRY_FAILED_AFTER => {
                return Preparation::Failed
            }
            _ => {}
        }
        if jobs
            .values()
            .filter(|job| matches!(job, Job::Preparing))
            .count()
            >= MAX_PREPARING
        {
            return Preparation::Preparing;
        }
        jobs.insert(video.to_string(), Job::Preparing);
        drop(jobs);
        let cache = Arc::clone(self);
        let video = video.to_string();
        std::thread::spawn(move || cache.run(&video, &resolve));
        Preparation::Preparing
    }

    fn run(&self, video: &str, resolve: &Resolver) {
        let part = self.dir.join(format!("{video}.mp4.part"));
        let fetched = fs::create_dir_all(&self.dir)
            .map_err(anyhow::Error::from)
            .and_then(|()| point::fetch_into(resolve, video, &part))
            .and_then(|bytes| {
                fs::rename(&part, self.path(video))?;
                Ok(bytes)
            });
        let mut jobs = self
            .jobs
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        match fetched {
            Ok(bytes) => {
                jobs.remove(video);
                tracing::info!("trailer {video} cached ({bytes} bytes)");
            }
            Err(error) => {
                let _ = fs::remove_file(&part);
                jobs.insert(video.to_string(), Job::Failed(Instant::now()));
                tracing::warn!("trailer {video} could not be fetched: {error:#}");
            }
        }
        drop(jobs);
        self.evict();
    }

    fn evict(&self) {
        let Ok(entries) = fs::read_dir(&self.dir) else {
            return;
        };
        let mut files: Vec<(SystemTime, u64, PathBuf)> = entries
            .flatten()
            .filter(|e| e.path().extension().is_some_and(|ext| ext == "mp4"))
            .filter_map(|e| {
                let meta = e.metadata().ok()?;
                Some((meta.modified().ok()?, meta.len(), e.path()))
            })
            .collect();
        files.sort();
        let mut total: u64 = files.iter().map(|(_, len, _)| len).sum();
        for (_, len, path) in files {
            if total <= self.cap_bytes {
                break;
            }
            if fs::remove_file(&path).is_ok() {
                total -= len;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_testing::temp_dir;

    fn absent() -> Resolver {
        Arc::new(|| None)
    }

    fn wait_until_settled(cache: &Arc<Trailers>, video: &str) -> Preparation {
        loop {
            let seen = cache.prepare(video, absent());
            if seen != Preparation::Preparing {
                return seen;
            }
            std::thread::yield_now();
        }
    }

    #[test]
    fn a_three_letter_track_language_reads_as_its_two_letter_code() {
        let codes: Vec<Option<String>> = ["fre", "fr-CA", "ja", ""]
            .into_iter()
            .map(spoken_language)
            .collect();

        assert_eq!(
            codes,
            vec![
                Some("fr".into()),
                Some("fr".into()),
                Some("ja".into()),
                None
            ]
        );
    }

    #[test]
    fn a_video_a_list_offered_stays_preparable_for_that_title_only() {
        let dir = temp_dir("trailers-cache");
        let cache = Trailers::new(dir.path().to_path_buf(), 1 << 30);

        cache.offer("movie:1061474", ["qu5n7RALVpE".to_string()]);

        assert!(cache.offered("movie:1061474", "qu5n7RALVpE"));
        assert!(!cache.offered("movie:603", "qu5n7RALVpE"));
    }

    #[test]
    fn a_cached_file_is_ready_without_asking_any_module() {
        let dir = temp_dir("trailers-cache");
        std::fs::write(dir.path().join("qu5n7RALVpE.mp4"), b"mp4").unwrap();
        let cache = Arc::new(Trailers::new(dir.path().to_path_buf(), 1 << 30));

        let state = cache.prepare("qu5n7RALVpE", absent());

        assert_eq!(state, Preparation::Ready);
    }

    #[test]
    fn a_fetch_with_no_module_answering_fails_and_is_not_retried_at_once() {
        let dir = temp_dir("trailers-cache");
        let cache = Arc::new(Trailers::new(dir.path().to_path_buf(), 1 << 30));

        let settled = wait_until_settled(&cache, "qu5n7RALVpE");

        assert_eq!(settled, Preparation::Failed);
        assert_eq!(cache.prepare("qu5n7RALVpE", absent()), Preparation::Failed);
    }

    #[test]
    fn something_that_is_not_a_video_id_never_reaches_the_disk() {
        let dir = temp_dir("trailers-cache");
        let cache = Arc::new(Trailers::new(dir.path().to_path_buf(), 1 << 30));

        let state = cache.prepare("../../kroma", absent());

        assert_eq!(state, Preparation::Failed);
        assert!(cache.file("../../kroma").is_none());
    }

    #[test]
    fn past_the_cap_the_least_recently_played_trailer_goes_first() {
        let dir = temp_dir("trailers-cache");
        for (video, age) in [
            ("aaaaaaaaaaa", 30),
            ("bbbbbbbbbbb", 20),
            ("ccccccccccc", 10),
        ] {
            let path = dir.path().join(format!("{video}.mp4"));
            std::fs::write(&path, vec![0u8; 100]).unwrap();
            let file = std::fs::File::options().append(true).open(&path).unwrap();
            file.set_modified(SystemTime::now() - Duration::from_secs(age))
                .unwrap();
        }
        let cache = Trailers::new(dir.path().to_path_buf(), 200);

        cache.evict();

        assert!(!dir.path().join("aaaaaaaaaaa.mp4").exists());
        assert!(dir.path().join("bbbbbbbbbbb.mp4").exists());
        assert!(dir.path().join("ccccccccccc.mp4").exists());
    }

    #[test]
    fn a_fetch_a_crash_cut_short_is_cleared_at_start() {
        let dir = temp_dir("trailers-cache");
        std::fs::write(dir.path().join("qu5n7RALVpE.mp4.part"), b"half").unwrap();

        Trailers::new(dir.path().to_path_buf(), 1 << 30);

        assert!(!dir.path().join("qu5n7RALVpE.mp4.part").exists());
    }
}
