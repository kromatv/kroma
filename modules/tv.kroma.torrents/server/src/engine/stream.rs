use std::io::{self, SeekFrom};
use std::ops::Range;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncSeek, ReadBuf};
use tokio::sync::watch;

pub trait AsyncReadSeek: AsyncRead + AsyncSeek + Send + Unpin {}

impl<T: AsyncRead + AsyncSeek + Send + Unpin> AsyncReadSeek for T {}

/// One file of a torrent, readable while the torrent is still downloading. A
/// read blocks until the piece under the cursor arrives and moves the engine's
/// piece picker ahead of it. Its download counts as playing while it lives.
pub struct TorrentStream {
    pub reader: Box<dyn AsyncReadSeek>,
    pub len: u64,
    pub file_name: String,
    pub file: usize,
    pub at: u64,
    pub _playing: Option<crate::downloads::Reader>,
}

impl TorrentStream {
    fn reached(&self) {
        if let Some(playing) = &self._playing {
            playing.reached(self.file, self.at);
        }
    }
}

impl AsyncRead for TorrentStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let before = buf.filled().len();
        let poll = Pin::new(&mut self.reader).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = &poll {
            self.at += (buf.filled().len() - before) as u64;
            self.reached();
        }
        poll
    }
}

impl AsyncSeek for TorrentStream {
    fn start_seek(mut self: Pin<&mut Self>, position: SeekFrom) -> io::Result<()> {
        Pin::new(&mut self.reader).start_seek(position)
    }

    fn poll_complete(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<u64>> {
        let poll = Pin::new(&mut self.reader).poll_complete(cx);
        if let Poll::Ready(Ok(at)) = &poll {
            self.at = *at;
            self.reached();
        }
        poll
    }
}

/// The read that fetches a container's index ahead of its head, as something a
/// caller can wait on. A file no engine could start one for has nothing to wait
/// for and is settled from the start.
#[derive(Clone)]
pub struct IndexWarm(Option<watch::Receiver<bool>>);

impl IndexWarm {
    pub(crate) fn none() -> Self {
        Self(None)
    }

    #[cfg(feature = "rqbit")]
    pub(crate) fn watching(read: watch::Receiver<bool>) -> Self {
        Self(Some(read))
    }

    pub(crate) async fn settled(self, within: Duration) -> bool {
        let Some(mut read) = self.0 else {
            return true;
        };
        let settled = tokio::time::timeout(within, read.wait_for(|done| *done)).await;
        settled.is_ok()
    }
}

/// What a container-index read may do with the torrent's selection while it runs.
/// Emptied, a peer has nothing else to offer and the index arrives alone; that is
/// only safe where the torrent is already narrowed to the files it puts back.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Selection {
    HeldEmpty(Vec<usize>),
    AsFound,
}

/// librqbit queues the pieces of this much of the file in front of a stream's
/// cursor (its `PER_STREAM_BUF_DEFAULT`), so this is the window the swarm is
/// being asked for while somebody reads.
pub const READ_AHEAD_BYTES: u64 = 32 * 1024 * 1024;

/// Where one file sits in its torrent, as a byte range, and which of the pieces
/// IT spans are on disk.
pub struct PieceLayout {
    pub have: Vec<bool>,
    pub first_piece: u64,
    pub piece_len: u64,
    pub file: Range<u64>,
}

impl PieceLayout {
    pub fn len(&self) -> u64 {
        self.file.end - self.file.start
    }

    pub fn whole(&self) -> bool {
        self.present(&self.file) == self.len()
    }

    /// The fraction of the file's bytes on disk, and for each of `buckets` equal
    /// slices of the file the percentage of it on disk, rounded down.
    pub fn buckets(&self, buckets: u64) -> (f64, Vec<u8>) {
        let (start, len) = (self.file.start, self.file.end - self.file.start);
        let slices = (0..buckets)
            .map(|at| start + len * at / buckets..start + len * (at + 1) / buckets)
            .map(|slice| percent(self.present(&slice), slice.end - slice.start))
            .collect();
        (self.present(&self.file) as f64 / len.max(1) as f64, slices)
    }

    fn present(&self, bytes: &Range<u64>) -> u64 {
        if bytes.is_empty() {
            return 0;
        }
        (bytes.start / self.piece_len..=(bytes.end - 1) / self.piece_len)
            .filter(|&piece| self.holds(piece))
            .map(|piece| {
                let at = piece * self.piece_len;
                bytes.end.min(at + self.piece_len) - bytes.start.max(at)
            })
            .sum()
    }

    /// Which of `buckets` slices of the file hold a byte of `asked`, 0-based, and
    /// only the ones not already complete. `asked` is byte ranges into the file,
    /// which is what a reader's window and a container-index read are.
    pub fn slices_touching(&self, asked: &[Range<u64>], buckets: u64) -> Vec<u64> {
        let len = self.file.end - self.file.start;
        (0..buckets)
            .filter(|at| {
                let slice = len * at / buckets..len * (at + 1) / buckets;
                !slice.is_empty()
                    && asked
                        .iter()
                        .any(|want| want.start < slice.end && slice.start < want.end)
            })
            .filter(|at| {
                let slice = self.file.start + len * at / buckets
                    ..self.file.start + len * (at + 1) / buckets;
                self.present(&slice) < slice.end - slice.start
            })
            .collect()
    }

    fn holds(&self, piece: u64) -> bool {
        piece
            .checked_sub(self.first_piece)
            .and_then(|at| self.have.get(at as usize))
            .copied()
            .unwrap_or(false)
    }
}

fn percent(part: u64, whole: u64) -> u8 {
    (part * 100).checked_div(whole).unwrap_or(0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_file_no_engine_could_fetch_an_index_for_is_settled_from_the_start() {
        let nothing = IndexWarm::none();

        let settled = nothing.settled(Duration::ZERO).await;

        assert!(settled);
    }

    #[cfg(feature = "rqbit")]
    #[tokio::test]
    async fn an_index_read_is_settled_only_once_it_says_so() {
        let (done, reading) = watch::channel(false);
        let warm = IndexWarm::watching(reading);

        let while_reading = warm.clone().settled(Duration::from_millis(20)).await;
        done.send(true).unwrap();

        assert!(!while_reading);
        assert!(warm.settled(Duration::from_millis(20)).await);
    }

    #[test]
    fn a_file_s_pieces_map_onto_its_own_byte_range_as_percentages() {
        let layout = PieceLayout {
            have: vec![true, false, true, true],
            first_piece: 0,
            piece_len: 100,
            file: 50..350,
        };

        let (progress, pieces) = layout.buckets(3);

        assert_eq!(pieces, [50, 50, 100]);
        assert_eq!(progress, 200.0 / 300.0);
    }

    #[test]
    fn the_slices_asked_for_are_named_and_the_ones_already_here_are_left_out() {
        let layout = PieceLayout {
            have: vec![true, false, false, false],
            first_piece: 0,
            piece_len: 100,
            file: 0..400,
        };

        let arriving = layout.slices_touching(&[0..150, 380..400], 4);

        assert_eq!(arriving, [1, 3], "slice 0 is already here");
    }

    #[test]
    fn nothing_asked_for_names_no_slice() {
        let layout = PieceLayout {
            have: vec![false, false],
            first_piece: 0,
            piece_len: 100,
            file: 0..200,
        };

        let nothing: [Range<u64>; 0] = [];
        let empty = [0..0, 200..200];

        assert_eq!(layout.slices_touching(&nothing, 4), Vec::<u64>::new());
        assert_eq!(layout.slices_touching(&empty, 4), Vec::<u64>::new());
    }

    #[test]
    fn a_window_over_a_file_deep_in_a_torrent_is_measured_from_the_file_s_own_start() {
        let layout = PieceLayout {
            have: vec![false, false, false],
            first_piece: 4,
            piece_len: 100,
            file: 450..700,
        };

        let head = [0..50, 0..0];

        let arriving = layout.slices_touching(&head, 5);

        assert_eq!(arriving, [0]);
    }

    #[test]
    fn a_file_deep_in_a_torrent_reads_the_pieces_it_spans_and_not_the_ones_before_them() {
        let layout = PieceLayout {
            have: vec![true, false, true],
            first_piece: 4,
            piece_len: 100,
            file: 450..700,
        };

        let (progress, pieces) = layout.buckets(5);

        assert_eq!(pieces, [100, 0, 0, 100, 100]);
        assert_eq!(progress, 0.6);
    }
}
