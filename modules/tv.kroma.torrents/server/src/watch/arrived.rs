use std::ops::Range;

use crate::engine::PieceLayout;

/// What of one file is on disk, read as time rather than as bytes: an offset
/// maps to a millisecond by the file's own average rate, which is all a reader
/// of a container still arriving has to go on.
pub(super) struct Arrived<'a> {
    layout: &'a PieceLayout,
    duration_ms: u64,
}

impl<'a> Arrived<'a> {
    pub(super) fn new(layout: &'a PieceLayout, duration_ms: u64) -> Self {
        Self {
            layout,
            duration_ms,
        }
    }

    pub(super) fn whole(&self) -> bool {
        self.layout.have.iter().all(|held| *held)
    }

    /// Every run of arrived bytes as the span of the runtime it covers, pulled
    /// in at each end that is not an end of the file, so a reader seeking to the
    /// keyframe before a span, or reading on past its last frame, stays inside
    /// the bytes on hand.
    ///
    /// The margin is `margin_ms` or a third of the run, whichever is smaller.
    pub(super) fn spans(&self, margin_ms: u64) -> Vec<Range<u64>> {
        self.runs()
            .iter()
            .filter_map(|run| self.span_of(run, margin_ms))
            .collect()
    }

    /// Whether everything within `reach_ms` of `at_ms` is on disk, which is
    /// what one frame read at that second costs: the seek lands on the keyframe
    /// before it and the decoder reads on past it.
    pub(super) fn holds(&self, at_ms: u64, reach_ms: u64) -> bool {
        if self.duration_ms == 0 || self.layout.file.is_empty() {
            return false;
        }
        let from = self.byte_at(at_ms.saturating_sub(reach_ms));
        let to = self.byte_at(at_ms.saturating_add(reach_ms));
        (from / self.layout.piece_len..=to / self.layout.piece_len).all(|piece| self.held(piece))
    }

    fn held(&self, piece: u64) -> bool {
        piece
            .checked_sub(self.layout.first_piece)
            .and_then(|at| self.layout.have.get(at as usize))
            .copied()
            .unwrap_or(false)
    }

    fn byte_at(&self, ms: u64) -> u64 {
        let file = &self.layout.file;
        let len = file.end - file.start;
        let into = (len as u128 * u128::from(ms.min(self.duration_ms))
            / u128::from(self.duration_ms.max(1))) as u64;
        (file.start + into).min(file.end.saturating_sub(1))
    }

    fn ms_at(&self, byte: u64) -> u64 {
        let file = &self.layout.file;
        let len = file.end - file.start;
        let into = byte.clamp(file.start, file.end) - file.start;
        (u128::from(self.duration_ms) * u128::from(into) / u128::from(len.max(1))) as u64
    }

    fn runs(&self) -> Vec<Range<u64>> {
        let (file, piece_len) = (&self.layout.file, self.layout.piece_len);
        let mut runs: Vec<Range<u64>> = Vec::new();
        for (at, held) in self.layout.have.iter().enumerate() {
            let piece = self.layout.first_piece + at as u64;
            let bytes =
                (piece * piece_len).max(file.start)..((piece + 1) * piece_len).min(file.end);
            match (held, runs.last_mut()) {
                (true, Some(open)) if open.end == bytes.start => open.end = bytes.end,
                (true, _) => runs.push(bytes),
                (false, _) => {}
            }
        }
        runs
    }

    fn span_of(&self, bytes: &Range<u64>, margin_ms: u64) -> Option<Range<u64>> {
        let file = &self.layout.file;
        let run = self.ms_at(bytes.start)..self.ms_at(bytes.end);
        let margin = margin_ms.min((run.end - run.start) / 3);
        let from = match bytes.start > file.start {
            true => run.start + margin,
            false => 0,
        };
        let to = match bytes.end < file.end {
            true => run.end.checked_sub(margin)?,
            false => self.duration_ms,
        };
        (from < to).then_some(from..to)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINUTE: u64 = 60_000;

    fn over(have: &[bool]) -> PieceLayout {
        PieceLayout {
            have: have.to_vec(),
            first_piece: 0,
            piece_len: 100,
            file: 0..have.len() as u64 * 100,
        }
    }

    #[test]
    fn a_file_still_arriving_covers_its_prefix_and_stops_short_of_the_last_byte_on_hand() {
        let layout = over(&[true, true, false, false]);
        let arrived = Arrived::new(&layout, 4 * MINUTE);

        let spans = arrived.spans(MINUTE / 2);

        assert_eq!(spans, vec![0..90_000]);
        assert!(!arrived.whole());
    }

    #[test]
    fn a_file_fully_arrived_covers_its_whole_runtime_with_no_margin_taken_off() {
        let layout = over(&[true, true, true]);
        let arrived = Arrived::new(&layout, 3 * MINUTE);

        let spans = arrived.spans(MINUTE / 2);

        assert_eq!(spans, vec![0..3 * MINUTE]);
        assert!(arrived.whole());
    }

    #[test]
    fn a_far_seek_leaves_an_island_of_its_own_beside_the_prefix() {
        let layout = over(&[true, false, false, true, true, false]);
        let arrived = Arrived::new(&layout, 6 * MINUTE);

        let spans = arrived.spans(10_000);

        assert_eq!(spans, vec![0..50_000, 190_000..290_000]);
    }

    #[test]
    fn a_short_island_keeps_its_middle_rather_than_being_dropped() {
        let layout = over(&[false, true, false, false]);
        let arrived = Arrived::new(&layout, 4 * MINUTE);

        let spans = arrived.spans(MINUTE);

        assert_eq!(spans, vec![80_000..100_000]);
    }

    #[test]
    fn a_second_is_held_only_when_what_a_frame_reads_around_it_is_too() {
        let layout = over(&[true, true, true, false, true]);
        let arrived = Arrived::new(&layout, 5 * MINUTE);

        let held = [MINUTE, 165_000, 3 * MINUTE + 30_000, 4 * MINUTE + 30_000]
            .map(|at| arrived.holds(at, 20_000));

        assert_eq!(held, [true, false, false, true]);
    }

    #[test]
    fn a_file_of_unknown_length_holds_nothing() {
        let layout = over(&[true, true]);

        let arrived = Arrived::new(&layout, 0);

        assert!(!arrived.holds(0, 1_000));
        assert!(arrived.spans(0).is_empty());
    }

    #[test]
    fn a_file_deep_in_a_torrent_reads_the_pieces_it_spans_and_not_the_ones_before_them() {
        let layout = PieceLayout {
            have: vec![true, true, false],
            first_piece: 4,
            piece_len: 100,
            file: 450..700,
        };
        let arrived = Arrived::new(&layout, 250_000);

        let spans = arrived.spans(0);

        assert_eq!(spans, vec![0..150_000]);
        assert!(arrived.holds(0, 1_000));
        assert!(!arrived.holds(200_000, 1_000));
    }
}
