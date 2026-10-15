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

use super::key::same_program;
use super::naming::seg_index;
use super::session::{Session, Sessions};

const IDLE_TIMEOUT: Duration = Duration::from_secs(180);
const REAP_INTERVAL: Duration = Duration::from_secs(30);
// Under this age a session counts as being read: never evicted, whatever the
// cap or the byte budget says.
pub(super) const BUDGET_GRACE: Duration = Duration::from_secs(45);

impl Sessions {
    // The cap takes the oldest session that has gone quiet, and nothing else. The
    // HLS routes are anonymous, so a session someone is reading cannot be told
    // from one they have left, and a cap that guessed wrong would end one
    // viewer's film to start another's.
    pub(super) async fn make_room(&self, map: &mut HashMap<String, Arc<Session>>) {
        let mut freed = 0;
        while map.len() >= self.cap {
            let Some((oldest, la)) = lru(map.iter()).await else {
                break;
            };
            if Instant::now().duration_since(la) < BUDGET_GRACE {
                break; // the oldest is being read, so every one of them is
            }
            freed += self.evict(map, &oldest).await;
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

    // A sibling of `key` is either the same viewer's superseded stream or another
    // viewer still on the title, and nothing here can tell them apart. So one
    // that has gone quiet goes now, and one still being read is only marked: the
    // reaper takes it a grace later if nothing reads it again, and the next
    // request for it clears the mark.
    pub(super) async fn reap_superseded(&self, map: &mut HashMap<String, Arc<Session>>, key: &str) {
        let now = Instant::now();
        let mut stale = Vec::new();
        for (k, s) in map.iter() {
            if k == key || !same_program(k, key) {
                continue;
            }
            if now.duration_since(*s.last_access.lock().await) >= BUDGET_GRACE {
                stale.push(k.clone());
            } else {
                s.supersede();
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
            let Some((k, la)) = lru(map.iter()).await else {
                break;
            };
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
        let held = if self.budget_bytes() == 0 {
            0
        } else {
            dir_bytes(&s.dir)
        };
        discard_dir(&s.dir);
        held
    }

    // The idle list is drawn up, the lock is released for the slow work, and by
    // the time it is taken back a viewer may have pressed play again. Killing
    // them then is worse than a 404: a `master()` racing this would poll a
    // directory that no longer exists for the whole of FILE_WAIT.
    async fn evict_if_still_idle(&self, map: &mut HashMap<String, Arc<Session>>, key: &str) -> u64 {
        let idle = match map.get(key) {
            Some(s) => s.idle_past_its_limit(Instant::now()).await,
            None => return 0,
        };
        if idle {
            self.evict(map, key).await
        } else {
            0
        }
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
                if s.idle_past_its_limit(now).await {
                    dead.push(id.clone());
                } else if let Some(cutoff) = s.window.cutoff() {
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
            self.serving.keep_only(&map).await;
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

impl Session {
    pub(super) fn supersede(&self) {
        self.superseded.store(true, Ordering::Relaxed);
    }

    pub(super) fn keep(&self) {
        self.superseded.store(false, Ordering::Relaxed);
    }

    // A superseded session has minutes of an ordinary idle life taken off it: a
    // remux nobody re-anchored into keeps pulling its input at up to twice
    // realtime, for a playlist nobody is reading.
    async fn idle_past_its_limit(&self, now: Instant) -> bool {
        let limit = match self.superseded.load(Ordering::Relaxed) {
            true => BUDGET_GRACE,
            false => IDLE_TIMEOUT,
        };
        now.duration_since(*self.last_access.lock().await) > limit
    }
}

async fn lru<'a>(
    sessions: impl Iterator<Item = (&'a String, &'a Arc<Session>)>,
) -> Option<(String, Instant)> {
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
mod tests;
