use std::collections::HashSet;
use std::sync::{Condvar, Mutex};

use super::WatchRequest;

#[derive(Clone, PartialEq, Eq, Hash)]
struct TitleKey {
    kind: String,
    tmdb_id: u64,
    episode: Option<(u32, u32)>,
}

/// The titles a watch is working on, one caller at a time each. One of these
/// lives for as long as the module serves the point.
#[derive(Default)]
pub struct WatchLocks {
    working: Mutex<HashSet<TitleKey>>,
    released: Condvar,
}

impl WatchLocks {
    /// Wait for whoever else is starting this title, then hold it until the
    /// returned lock drops. Blocking.
    #[must_use]
    pub fn hold(&self, request: &WatchRequest, episode: Option<(u32, u32)>) -> TitleLock<'_> {
        let key = TitleKey {
            kind: request.kind.clone(),
            tmdb_id: request.tmdb_id,
            episode,
        };
        let mut working = self.working.lock().unwrap();
        while !working.insert(key.clone()) {
            working = self.released.wait(working).unwrap();
        }
        TitleLock { locks: self, key }
    }
}

pub struct TitleLock<'a> {
    locks: &'a WatchLocks,
    key: TitleKey,
}

impl Drop for TitleLock<'_> {
    fn drop(&mut self) {
        self.locks.working.lock().unwrap().remove(&self.key);
        self.locks.released.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::sync::Arc;
    use std::time::Duration;

    use super::super::test_support::{severance_s01e02, sintel};
    use super::*;

    fn taken_in_another_thread(
        locks: &Arc<WatchLocks>,
        request: WatchRequest,
        episode: Option<(u32, u32)>,
    ) -> mpsc::Receiver<()> {
        let (taken, took) = mpsc::channel();
        let locks = Arc::clone(locks);
        std::thread::spawn(move || {
            let _lock = locks.hold(&request, episode);
            taken.send(()).unwrap();
        });
        took
    }

    #[test]
    fn a_second_start_of_one_title_waits_for_the_first_to_let_go() {
        let locks = Arc::new(WatchLocks::default());
        let first = locks.hold(&sintel(), None);
        let took = taken_in_another_thread(&locks, sintel(), None);

        let while_first_holds = took.recv_timeout(Duration::from_millis(100));
        drop(first);
        let once_it_let_go = took.recv_timeout(Duration::from_secs(5));

        assert!(while_first_holds.is_err());
        assert!(once_it_let_go.is_ok());
    }

    #[test]
    fn a_start_of_another_episode_of_the_season_does_not_wait() {
        let locks = Arc::new(WatchLocks::default());
        let _second_episode = locks.hold(&severance_s01e02(), Some((1, 2)));

        let took = taken_in_another_thread(&locks, severance_s01e02(), Some((1, 3)));

        assert!(took.recv_timeout(Duration::from_secs(5)).is_ok());
    }
}
