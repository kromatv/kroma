//! Taking sessions away: the concurrency cap, the superseded-sibling sweep, the
//! on-disk byte budget, and the periodic reaper that also advances each live
//! session's retention window.

use std::collections::HashMap;
use std::ffi::OsStr;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::time::sleep;

use super::naming::seg_index;
use super::session::{Session, Sessions};
use super::same_program;

const IDLE_TIMEOUT: Duration = Duration::from_secs(180);
const REAP_INTERVAL: Duration = Duration::from_secs(30);
// Under this age a session counts as actively playing: never evicted to
// reclaim disk, dropped under the concurrency cap only as a last resort.
pub(super) const BUDGET_GRACE: Duration = Duration::from_secs(45);

impl Sessions {
    // Victim order under the concurrency cap: a session that has gone quiet, else
    // a sibling of `key` (almost certainly the arriving client's own superseded
    // stream, so no other viewer is cut off), else the plain LRU.
    pub(super) async fn make_room(&self, map: &mut HashMap<String, Arc<Session>>, key: &str) {
        let mut freed = 0;
        while map.len() >= self.cap {
            let Some((oldest, la)) = lru(map.iter()).await else { break };
            let victim = if Instant::now().duration_since(la) >= BUDGET_GRACE {
                oldest
            } else {
                lru_sibling(map, key).await.unwrap_or(oldest)
            };
            freed += self.evict(map, &victim).await;
        }
        // `bytes()` walks the whole cache and this runs with the sessions lock
        // held, so an unlimited budget must not pay for a figure nothing reads.
        if self.budget_bytes() != 0 {
            let total = self.bytes().saturating_sub(freed);
            self.enforce_budget(map, total).await;
        }
    }

    pub(super) fn budget_bytes(&self) -> u64 {
        self.budget.load(Ordering::Relaxed)
    }

    // A sibling still being read is left alone: the HLS routes are anonymous, so
    // a warm sibling could equally be a second viewer on the same title.
    pub(super) async fn reap_superseded(&self, map: &mut HashMap<String, Arc<Session>>, key: &str) {
        let now = Instant::now();
        let mut stale = Vec::new();
        for (k, s) in map.iter() {
            let quiet = now.duration_since(*s.last_access.lock().await) >= BUDGET_GRACE;
            if k != key && quiet && same_program(k, key) {
                stale.push(k.clone());
            }
        }
        for k in stale {
            self.evict(map, &k).await;
        }
    }

    // Evict idle sessions oldest-first until the cache is under budget (0
    // disables trimming). A session younger than BUDGET_GRACE is left alone
    // even if that briefly exceeds the budget: dropping its segments would stall it.
    async fn enforce_budget(&self, map: &mut HashMap<String, Arc<Session>>, mut total: u64) {
        let budget = self.budget.load(Ordering::Relaxed);
        if budget == 0 {
            return;
        }
        while total > budget && map.len() > 1 {
            let Some((k, la)) = lru(map.iter()).await else { break };
            if Instant::now().duration_since(la) < BUDGET_GRACE {
                break; // the oldest is live, so the rest are too
            }
            total = total.saturating_sub(self.evict(map, &k).await);
        }
    }

    // Returns the bytes the session was holding, so a caller measuring the cache
    // afterwards can discount a directory the discard has not unlinked yet.
    async fn evict(&self, map: &mut HashMap<String, Arc<Session>>, key: &str) -> u64 {
        let Some(s) = map.remove(key) else { return 0 };
        let _ = s.child.lock().await.start_kill();
        let held = if self.budget_bytes() == 0 { 0 } else { dir_bytes(&s.dir) };
        discard_dir(&s.dir);
        held
    }

    // The idle list is drawn up, the lock is released for the slow work, and by
    // the time it is taken back a viewer may have pressed play again. Killing
    // them then is worse than a 404: a `master()` racing this would poll a
    // directory that no longer exists for the whole of FILE_WAIT.
    async fn evict_if_still_idle(&self, map: &mut HashMap<String, Arc<Session>>, key: &str) -> u64 {
        let idle = match map.get(key) {
            Some(s) => Instant::now().duration_since(*s.last_access.lock().await) > IDLE_TIMEOUT,
            None => return 0,
        };
        if idle { self.evict(map, key).await } else { 0 }
    }

    // Deleting segments and walking the cache are the two slow things here, and
    // every in-flight segment request needs the same lock: neither runs under it,
    // which on a network mount is the difference between a pause and a stall for
    // everyone on the box.
    async fn reap_once(&self) {
        let now = Instant::now();
        let (dead, plans) = {
            let map = self.inner.lock().await;
            let mut dead = Vec::new();
            let mut plans = Vec::new();
            for (id, s) in map.iter() {
                if now.duration_since(*s.last_access.lock().await) > IDLE_TIMEOUT {
                    dead.push(id.clone());
                } else if let Some(cutoff) = s.prune_cutoff() {
                    plans.push((s.dir.clone(), cutoff));
                }
            }
            (dead, plans)
        };
        if !plans.is_empty() {
            let _ = tokio::task::spawn_blocking(move || {
                for (dir, cutoff) in plans {
                    prune_dir(&dir, cutoff);
                }
            })
            .await;
        }
        let mut freed = 0;
        {
            let mut map = self.inner.lock().await;
            for id in dead {
                freed += self.evict_if_still_idle(&mut map, &id).await;
            }
        }
        // Measured AFTER the idle evictions, or the budget would be enforced
        // against directories that no longer exist and take a live viewer with
        // them. Outside the lock: it is a full walk of the cache.
        if self.budget_bytes() != 0 {
            let total = self.bytes().saturating_sub(freed);
            let mut map = self.inner.lock().await;
            self.enforce_budget(&mut map, total).await;
        }
    }

    pub fn spawn_reaper(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                sleep(REAP_INTERVAL).await;
                this.reap_once().await;
            }
        });
    }
}

async fn lru<'a>(sessions: impl Iterator<Item = (&'a String, &'a Arc<Session>)>) -> Option<(String, Instant)> {
    let mut victim: Option<(String, Instant)> = None;
    for (k, s) in sessions {
        let la = *s.last_access.lock().await;
        match &victim {
            Some((_, t)) if *t <= la => {}
            _ => victim = Some((k.clone(), la)),
        }
    }
    victim
}

async fn lru_sibling(map: &HashMap<String, Arc<Session>>, key: &str) -> Option<String> {
    lru(map.iter().filter(|(k, _)| k.as_str() != key && same_program(k, key))).await.map(|(k, _)| k)
}

// Renaming is one metadata operation; the recursive delete behind it is a walk,
// so that runs on a blocking thread. The session's own name is free the moment
// this returns, so a key played again gets a clean directory rather than one the
// pending delete is about to empty.
pub(super) fn discard_dir(dir: &Path) {
    let Some(name) = dir.file_name().and_then(OsStr::to_str) else {
        return;
    };
    let doomed = dir.with_file_name(format!("{name}.gone-{}", kroma_primitives::random_token()));
    if std::fs::rename(dir, &doomed).is_err() {
        return;
    }
    tokio::task::spawn_blocking(move || {
        let _ = std::fs::remove_dir_all(&doomed);
    });
}

// The playlist keeps listing pruned entries; a request for one 404s rather than
// waiting, and the client re-anchors.
fn prune_dir(dir: &Path, cutoff: u64) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if let Some(idx) = entry.file_name().to_str().and_then(seg_index) {
            if idx < cutoff {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

pub(super) fn dir_bytes(dir: &Path) -> u64 {
    walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

#[cfg(test)]
mod tests {
    use super::super::naming::session_dir;
    use super::super::session::testing::{fill, keys, registry, registry_with_budget, LIVE};
    use super::*;

    const QUIET: Duration = Duration::from_secs(BUDGET_GRACE.as_secs() + 5);
    const DEAD: Duration = Duration::from_secs(IDLE_TIMEOUT.as_secs() + 30);

    #[tokio::test]
    async fn hard_cap_prefers_the_arriving_clients_own_superseded_sibling() {
        // itA is the LRU; itB toggles the audio filter, minting a third key of its own.
        let (s, _dir) = registry(
            "sibling",
            2,
            &[("itA:copy:0:a0", Duration::from_secs(3)), ("itB:aac:0:a0", LIVE)],
        )
        .await;
        {
            let mut map = s.inner.lock().await;
            s.make_room(&mut map, "itB:aac-night:0:a0").await;
        }
        assert_eq!(keys(&s).await, ["itA:copy:0:a0"]);
        assert!(!s.root.join(session_dir("itB:aac:0:a0")).exists());
    }

    #[tokio::test]
    async fn hard_cap_evicts_a_quiet_session_before_a_live_sibling() {
        let (s, _dir) = registry("quiet", 2, &[("itA:copy:0:a0", QUIET), ("itB:aac:0:a0", LIVE)]).await;
        {
            let mut map = s.inner.lock().await;
            s.make_room(&mut map, "itB:aac-night:0:a0").await;
        }
        assert_eq!(keys(&s).await, ["itB:aac:0:a0"]);
    }

    #[tokio::test]
    async fn hard_cap_still_frees_a_slot_when_every_session_is_live_and_unrelated() {
        let (s, _dir) = registry(
            "fallback",
            2,
            &[("itA:copy:0:a0", Duration::from_secs(3)), ("itB:aac:0:a0", LIVE)],
        )
        .await;
        {
            let mut map = s.inner.lock().await;
            s.make_room(&mut map, "itC:copy:0:a0").await;
        }
        assert_eq!(keys(&s).await, ["itB:aac:0:a0"]);
    }

    #[tokio::test]
    async fn superseded_siblings_are_reclaimed_only_once_quiet() {
        let (s, _dir) = registry(
            "supersede",
            8,
            &[
                ("itA:copy:0:a0", QUIET),  // the same program, gone quiet: superseded
                ("itA:aac:600:a0", LIVE),  // the same program but still being read
                ("itA:copy:0:a1", QUIET),  // another language track = another program
                ("itB:copy:0:a0", QUIET),  // another title
            ],
        )
        .await;
        {
            let mut map = s.inner.lock().await;
            s.reap_superseded(&mut map, "itA:aac-night:900:a0").await;
        }
        assert_eq!(keys(&s).await, ["itA:aac:600:a0", "itA:copy:0:a1", "itB:copy:0:a0"]);
        assert!(!s.root.join(session_dir("itA:copy:0:a0")).exists());
    }

    // The reaper used to measure the cache before evicting the idle sessions,
    // so the budget was enforced against bytes it was about to free and took a
    // paused viewer with it.
    #[tokio::test]
    async fn the_budget_is_enforced_against_what_survives_the_reap() {
        let (s, _dir) = registry_with_budget(
            "budget-order",
            8,
            500,
            &[("itA:copy:0:a0", DEAD), ("itB:copy:0:a0", QUIET), ("itC:copy:0:a0", QUIET)],
        )
        .await;
        fill(&s, "itA:copy:0:a0", 1000);
        fill(&s, "itB:copy:0:a0", 100);
        fill(&s, "itC:copy:0:a0", 100);

        s.reap_once().await;

        assert_eq!(keys(&s).await, ["itB:copy:0:a0", "itC:copy:0:a0"]);
    }

    #[tokio::test]
    async fn the_budget_still_trims_when_the_survivors_alone_exceed_it() {
        let (s, _dir) = registry_with_budget(
            "budget-trim",
            8,
            500,
            &[("itA:copy:0:a0", QUIET), ("itB:copy:0:a0", LIVE)],
        )
        .await;
        fill(&s, "itA:copy:0:a0", 400);
        fill(&s, "itB:copy:0:a0", 400);

        s.reap_once().await;

        assert_eq!(keys(&s).await, ["itB:copy:0:a0"], "the quiet one goes, the live one stays");
    }

    // The idle list is drawn up, the lock is released for the pruning, and the
    // viewer presses play in that window.
    #[tokio::test]
    async fn a_session_revived_before_the_eviction_lands_is_spared() {
        let (s, _dir) = registry("revived", 8, &[("itA:copy:0:a0", DEAD)]).await;
        {
            let mut map = s.inner.lock().await;
            *map.get("itA:copy:0:a0").expect("seeded").last_access.lock().await = Instant::now();
            s.evict_if_still_idle(&mut map, "itA:copy:0:a0").await;
        }
        assert_eq!(keys(&s).await, ["itA:copy:0:a0"]);
        assert!(s.root.join(session_dir("itA:copy:0:a0")).exists(), "its segments survive too");
    }

    #[tokio::test]
    async fn a_session_still_idle_when_the_eviction_lands_is_taken() {
        let (s, _dir) = registry("still-idle", 8, &[("itA:copy:0:a0", DEAD)]).await;
        {
            let mut map = s.inner.lock().await;
            s.evict_if_still_idle(&mut map, "itA:copy:0:a0").await;
        }
        assert!(keys(&s).await.is_empty());
    }

    #[tokio::test]
    async fn discarding_a_directory_frees_its_name_before_it_returns() {
        let data = kroma_testing::temp_dir("hls-test-discard");
        let dir = data.path().join("s");
        std::fs::create_dir_all(&dir).expect("session dir");
        std::fs::write(dir.join("seg_00001.m4s"), b"x").expect("segment");

        discard_dir(&dir);

        assert!(!dir.exists());
    }

    #[tokio::test]
    async fn eviction_reports_the_bytes_it_frees() {
        let (s, _dir) = registry_with_budget("freed", 8, 500, &[("itA:copy:0:a0", QUIET)]).await;
        fill(&s, "itA:copy:0:a0", 300);

        let freed = {
            let mut map = s.inner.lock().await;
            s.evict(&mut map, "itA:copy:0:a0").await
        };

        assert_eq!(freed, 300);
    }

    #[tokio::test]
    async fn prune_dir_removes_only_what_is_behind_the_cutoff() {
        let data = kroma_testing::temp_dir("hls-test-prune");
        let dir = data.path().join("s");
        std::fs::create_dir_all(&dir).expect("session dir");
        for name in ["seg_00001.m4s", "seg_00009.m4s", "seg_00010.m4s", "init.mp4", "index.m3u8"] {
            std::fs::write(dir.join(name), b"x").expect("segment");
        }
        prune_dir(&dir, 10);
        assert!(!dir.join("seg_00001.m4s").exists());
        assert!(!dir.join("seg_00009.m4s").exists());
        assert!(dir.join("seg_00010.m4s").exists());
        assert!(dir.join("init.mp4").exists());
        assert!(dir.join("index.m3u8").exists());
    }
}
