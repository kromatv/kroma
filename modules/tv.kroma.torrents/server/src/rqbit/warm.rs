use std::collections::{HashMap, HashSet};
use std::io::SeekFrom;
use std::ops::Range;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::watch;

use super::RqbitEngine;
use crate::container_index::{container_index, ContainerIndex};
use crate::engine::{IndexWarm, Selection, TorrentStream};

const GUESSED_INDEX_BYTES: u64 = 1024 * 1024;
const HEAD_BYTES: usize = 64 * 1024;
const CHUNK: usize = 64 * 1024;
const GIVES_UP_AFTER: Duration = Duration::from_secs(45);

impl RqbitEngine {
    pub(crate) fn warm_index(
        self: &Arc<Self>,
        client_ref: &str,
        file_index: usize,
        selection: Selection,
    ) -> IndexWarm {
        let (done, watching) = watch::channel(false);
        let engine = Arc::clone(self);
        let client_ref = client_ref.to_string();
        self.warming.lock().unwrap().insert(ReadingFile {
            client_ref: client_ref.clone(),
            file: file_index,
        });
        self.handle.spawn(async move {
            let read = read_index(&engine, &client_ref, file_index, selection);
            if tokio::time::timeout(GIVES_UP_AFTER, read).await.is_err() {
                tracing::debug!(torrent = %client_ref, file = file_index, "gave up fetching a container's index");
            }
            engine.warming.lock().unwrap().remove(&ReadingFile {
                client_ref: client_ref.clone(),
                file: file_index,
            });
            let _ = done.send(true);
        });
        IndexWarm::watching(watching)
    }

    /// Which parts of one file the module is asking the swarm for right now, as
    /// byte ranges into the file: the container index while that read is in
    /// flight, and the read-ahead window in front of whatever is reading it.
    ///
    /// This is what the module asked for, not what the peers are sending: nothing
    /// public in librqbit 9.0.0-rc.0 names a piece in flight.
    pub(crate) fn asking_for(&self, client_ref: &str, file: usize, len: u64) -> Vec<Range<u64>> {
        let asked = ReadingFile {
            client_ref: client_ref.to_string(),
            file,
        };
        if !self.warming.lock().unwrap().contains(&asked) {
            return Vec::new();
        }
        let head = 0..(HEAD_BYTES as u64).min(len);
        let index = len.saturating_sub(GUESSED_INDEX_BYTES)..len;
        vec![head, index]
    }

    /// Whether this torrent's selection is held empty while its container index
    /// is fetched, which the engine reports as a torrent with nothing left to do.
    pub(crate) fn selection_held(&self, client_ref: &str) -> bool {
        self.held_selections.holding(client_ref)
    }

    pub(super) async fn select(
        &self,
        client_ref: &str,
        files: HashSet<usize>,
    ) -> anyhow::Result<()> {
        let handle = self.find(client_ref)?;
        self.session().update_only_files(&handle, &files).await
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub(super) struct ReadingFile {
    pub(super) client_ref: String,
    pub(super) file: usize,
}

#[derive(Default)]
pub(super) struct Holds(Mutex<HashMap<String, Held>>);

struct Held {
    reads: usize,
    watched: Vec<usize>,
}

impl Holds {
    fn started(&self, client_ref: &str, watched: Vec<usize>) {
        self.0
            .lock()
            .unwrap()
            .entry(client_ref.to_string())
            .and_modify(|held| {
                held.reads += 1;
                held.watched = watched.clone();
            })
            .or_insert(Held { reads: 1, watched });
    }

    fn finished(&self, client_ref: &str) -> Option<Vec<usize>> {
        let mut held = self.0.lock().unwrap();
        let entry = held.get_mut(client_ref)?;
        entry.reads = entry.reads.saturating_sub(1);
        (entry.reads == 0).then(|| entry.watched.clone())
    }

    fn restored(&self, client_ref: &str) {
        self.0.lock().unwrap().remove(client_ref);
    }

    fn holding(&self, client_ref: &str) -> bool {
        self.0.lock().unwrap().contains_key(client_ref)
    }
}

struct Alone {
    engine: Arc<RqbitEngine>,
    client_ref: String,
}

impl Alone {
    async fn over(
        engine: &Arc<RqbitEngine>,
        client_ref: &str,
        put_back: Vec<usize>,
    ) -> Option<Self> {
        engine.held_selections.started(client_ref, put_back);
        let held = Self {
            engine: Arc::clone(engine),
            client_ref: client_ref.to_string(),
        };
        match engine.select(client_ref, HashSet::new()).await {
            Ok(()) => Some(held),
            Err(e) => {
                tracing::warn!(torrent = %client_ref, error = %format!("{e:#}"), "could not hold a torrent's selection back");
                None
            }
        }
    }
}

impl Drop for Alone {
    fn drop(&mut self) {
        let engine = Arc::clone(&self.engine);
        let client_ref = std::mem::take(&mut self.client_ref);
        // The hold is only over once every read over this torrent has finished,
        // or an earlier one would put the selection back under a later one and
        // leave it reading a file the swarm is no longer asked for.
        let Some(watched) = engine.held_selections.finished(&client_ref) else {
            return;
        };
        self.engine.handle.clone().spawn(async move {
            if let Err(e) = engine
                .select(&client_ref, watched.into_iter().collect())
                .await
            {
                tracing::warn!(torrent = %client_ref, error = %format!("{e:#}"), "could not put a torrent's selection back");
            }
            // Only once the file is selected again, or the torrent would read as
            // finished with nothing selected and be imported half-empty.
            engine.held_selections.restored(&client_ref);
        });
    }
}

async fn read_index(
    engine: &Arc<RqbitEngine>,
    client_ref: &str,
    file_index: usize,
    selection: Selection,
) {
    let Ok(mut stream) = engine.open_stream(client_ref, file_index).await else {
        return;
    };
    let len = stream.len;
    let guessed = len.saturating_sub(GUESSED_INDEX_BYTES);
    let _held = match selection {
        Selection::HeldEmpty(put_back) => Alone::over(engine, client_ref, put_back).await,
        Selection::AsFound => None,
    };
    if !read_range(&mut stream, guessed..len).await {
        return;
    }
    let Some(head) = read_head(&mut stream).await else {
        return;
    };
    if let ContainerIndex::Behind(index) = container_index(&head, len) {
        if index.start < guessed {
            read_range(&mut stream, index.start..guessed).await;
        }
    }
    tracing::debug!(torrent = %client_ref, file = file_index, "fetched a container's index");
}

async fn read_head(stream: &mut TorrentStream) -> Option<Vec<u8>> {
    let want = usize::try_from(stream.len)
        .unwrap_or(HEAD_BYTES)
        .min(HEAD_BYTES);
    stream.seek(SeekFrom::Start(0)).await.ok()?;
    let mut head = vec![0u8; want];
    stream.read_exact(&mut head).await.ok()?;
    Some(head)
}

async fn read_range(stream: &mut TorrentStream, bytes: Range<u64>) -> bool {
    if stream.seek(SeekFrom::Start(bytes.start)).await.is_err() {
        return false;
    }
    let mut left = bytes.end - bytes.start;
    let mut discarded = vec![0u8; CHUNK];
    while left > 0 {
        let take = usize::try_from(left).unwrap_or(CHUNK).min(CHUNK);
        match stream.read(&mut discarded[..take]).await {
            Ok(0) | Err(_) => return false,
            Ok(read) => left -= read as u64,
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_files_a_second_read_is_watching_are_the_ones_put_back() {
        let holds = Holds::default();
        holds.started("deadbeef", vec![3]);
        holds.started("deadbeef", vec![5, 8]);

        let after_the_first = holds.finished("deadbeef");
        let after_the_second = holds.finished("deadbeef");

        assert_eq!(after_the_first, None);
        assert_eq!(after_the_second, Some(vec![5, 8]));
    }

    #[test]
    fn a_torrent_reads_as_held_until_its_selection_is_back() {
        let holds = Holds::default();
        holds.started("deadbeef", vec![0]);

        holds.finished("deadbeef");
        let before = holds.holding("deadbeef");
        holds.restored("deadbeef");

        assert!(before, "the hold outlives the last read");
        assert!(!holds.holding("deadbeef"));
    }

    #[test]
    fn one_torrents_hold_says_nothing_about_another() {
        let holds = Holds::default();
        holds.started("deadbeef", vec![0]);

        assert!(!holds.holding("cafebabe"));
        assert_eq!(holds.finished("cafebabe"), None);
        assert_eq!(holds.finished("deadbeef"), Some(vec![0]));
    }
}
