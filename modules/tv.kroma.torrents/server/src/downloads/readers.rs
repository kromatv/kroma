use std::sync::atomic::{AtomicI64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use kroma_module_sdk::primitives::now_ms;

use super::DownloadManager;

pub(crate) struct Readers {
    open: AtomicUsize,
    viewers: AtomicUsize,
    closed_at: AtomicI64,
    at: Mutex<Option<At>>,
}

struct At {
    file: usize,
    byte: u64,
}

/// Who a stream is opened for. The module reads a file it is serving itself, for
/// the probe and for the remux, and those reads are not somebody watching.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Reading {
    ForAViewer,
    Internally,
}

/// One open stream of a download. It holds the download in the watch cache until
/// it is dropped, and a viewer's read also counts as playing.
pub(crate) struct Reader {
    readers: Arc<Readers>,
    reading: Reading,
}

impl Readers {
    fn open(self: &Arc<Self>, reading: Reading) -> Reader {
        self.open.fetch_add(1, Ordering::SeqCst);
        if reading == Reading::ForAViewer {
            self.viewers.fetch_add(1, Ordering::SeqCst);
        }
        Reader {
            readers: Arc::clone(self),
            reading,
        }
    }

    fn playing(&self) -> bool {
        self.viewers.load(Ordering::SeqCst) > 0
    }

    // Any open read holds the cache, the module's own included: a remux running
    // for a viewer is the reason the file is still wanted.
    pub(super) fn holds(&self, grace_ms: i64, now: i64) -> bool {
        self.open.load(Ordering::SeqCst) > 0
            || now - self.closed_at.load(Ordering::SeqCst) < grace_ms
    }

    pub(super) fn cursor_of(&self, file: usize) -> Option<u64> {
        let at = self.at.lock().unwrap();
        at.as_ref().filter(|at| at.file == file).map(|at| at.byte)
    }

    #[cfg(test)]
    pub(super) fn backdate(&self, ms: i64) {
        self.closed_at.fetch_sub(ms, Ordering::SeqCst);
    }
}

impl Reader {
    pub(crate) fn reached(&self, file: usize, byte: u64) {
        *self.readers.at.lock().unwrap() = Some(At { file, byte });
    }
}

impl Drop for Reader {
    fn drop(&mut self) {
        if self.reading == Reading::ForAViewer {
            self.readers.viewers.fetch_sub(1, Ordering::SeqCst);
        }
        if self.readers.open.fetch_sub(1, Ordering::SeqCst) == 1 {
            self.readers.closed_at.store(now_ms(), Ordering::SeqCst);
            *self.readers.at.lock().unwrap() = None;
        }
    }
}

impl DownloadManager {
    pub(super) fn is_playing(&self, download_id: &str) -> bool {
        let readers = self.readers.lock().unwrap();
        readers.get(download_id).is_some_and(|open| open.playing())
    }

    pub(super) fn held(&self, download_id: &str, grace_ms: i64, now: i64) -> bool {
        let readers = self.readers.lock().unwrap();
        readers
            .get(download_id)
            .is_some_and(|open| open.holds(grace_ms, now))
    }

    pub(super) fn track_readers(&self, download_id: &str) -> Arc<Readers> {
        let mut readers = self.readers.lock().unwrap();
        let entry = readers.entry(download_id.to_string()).or_insert_with(|| {
            Arc::new(Readers {
                open: AtomicUsize::new(0),
                viewers: AtomicUsize::new(0),
                closed_at: AtomicI64::new(now_ms()),
                at: Mutex::new(None),
            })
        });
        Arc::clone(entry)
    }

    pub(super) fn cursor(&self, download_id: &str, file: usize) -> Option<u64> {
        let readers = self.readers.lock().unwrap();
        readers.get(download_id)?.cursor_of(file)
    }

    pub(super) fn playing_guard(&self, download_id: &str, reading: Reading) -> Reader {
        self.track_readers(download_id).open(reading)
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{added, manager_over};
    use super::*;

    #[test]
    fn the_modules_own_read_of_a_file_is_nobody_watching() {
        let (_host, manager) = manager_over("torrents-readers-internal", &[added("d1")]);

        let _probing = manager.playing_guard("d1", Reading::Internally);

        assert!(
            !manager.is_playing("d1"),
            "the module is probing its own file"
        );
        assert!(
            manager.held("d1", 60_000, kroma_module_sdk::primitives::now_ms()),
            "and the cache is held open while it does"
        );
    }

    #[test]
    fn a_viewers_read_is_somebody_watching() {
        let (_host, manager) = manager_over("torrents-readers-viewer", &[added("d1")]);

        let _watching = manager.playing_guard("d1", Reading::ForAViewer);

        assert!(manager.is_playing("d1"));
    }

    #[test]
    fn a_download_plays_until_its_last_stream_closes() {
        let (_host, manager) = manager_over("torrents-readers", &[added("d1")]);
        let streams = [
            manager.playing_guard("d1", Reading::ForAViewer),
            manager.playing_guard("d1", Reading::ForAViewer),
        ];

        let playing = streams.map(|stream| {
            drop(stream);
            manager.is_playing("d1")
        });

        assert_eq!(playing, [true, false]);
    }

    #[test]
    fn a_playing_download_leaves_the_ledger_only_without_its_data() {
        let (_host, manager) = manager_over("torrents-readers-remove", &[added("d1")]);
        let _stream = manager.playing_guard("d1", Reading::ForAViewer);

        let removed = [true, false].map(|delete_data| manager.remove("d1", delete_data).is_ok());

        assert_eq!(removed, [false, true]);
    }
}
