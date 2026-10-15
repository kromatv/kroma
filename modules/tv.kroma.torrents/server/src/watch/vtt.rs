use std::collections::{HashMap, HashSet};
use std::ops::Range;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use kroma_module_sdk::media::probe::ProbeResult;
use kroma_module_sdk::media::subtitles::{extract_vtt, is_text_codec};

use crate::DownloadManager;

use super::arrived::Arrived;
use super::cues;
use super::file::WatchedFile;
use super::probes::offered;
use super::source::Refusal;
use super::Watch;

const MARGIN_MS: u64 = 10_000;
const GROWTH_MS: u64 = 30_000;
// A pass that fell short of its span is worth running again, but not on every
// poll: one is a whole demux of what has arrived.
const REREAD_AFTER: Duration = Duration::from_secs(30);
const MAX_SPANS: usize = 8;
const GIVES_UP_AFTER: Duration = Duration::from_secs(120);

/// One track's cues and whether the file they came out of is all here. While it
/// is not, the answer is what has arrived so far and grows.
#[derive(Clone)]
pub struct Vtt {
    pub body: Arc<String>,
    pub partial: bool,
}

#[derive(Default)]
struct Track {
    answered: Option<Vtt>,
    proved_ms: u64,
    read_at: Option<Instant>,
}

type Held = Arc<tokio::sync::Mutex<Track>>;

#[derive(Default)]
pub struct Vtts(Mutex<HashMap<(WatchedFile, usize), Held>>);

impl Vtts {
    pub(super) fn downloads(&self) -> HashSet<String> {
        self.0
            .lock()
            .unwrap()
            .keys()
            .map(|(watched, _)| watched.download.clone())
            .collect()
    }

    pub(super) fn forget(&self, downloads: &HashSet<String>) {
        self.0
            .lock()
            .unwrap()
            .retain(|(watched, _), _| !downloads.contains(&watched.download));
    }
}

impl Watch {
    /// The cues of one of the file's subtitle tracks: its own first, then the
    /// subtitle files beside it, which is the order they are listed in.
    pub async fn subtitles(
        &self,
        manager: &Arc<DownloadManager>,
        watched: &WatchedFile,
        index: usize,
    ) -> Result<Vtt, Refusal> {
        offered(manager, watched).await?;
        let probed = self.probe(manager, watched).await?;
        match index.checked_sub(probed.subtitles.len()) {
            Some(nth) => self.subtitle_beside(manager, watched, nth).await,
            None => self.subtitle_inside(manager, watched, &probed, index).await,
        }
    }

    /// The cues of one track found in what of `watched` is on disk.
    ///
    /// Nothing outside that is read, so no pass can ask the swarm for a piece
    /// the viewer's own playback has not asked for.
    async fn subtitle_inside(
        &self,
        manager: &Arc<DownloadManager>,
        watched: &WatchedFile,
        probed: &ProbeResult,
        index: usize,
    ) -> Result<Vtt, Refusal> {
        let track = probed
            .subtitles
            .get(index)
            .ok_or_else(|| Refusal::Unknown(format!("this file has no subtitle track {index}")))?;
        if !is_text_codec(&track.codec) {
            return Err(Refusal::Unknown(format!(
                "a {} subtitle is a picture and cannot become text",
                track.codec
            )));
        }
        let duration_ms = probed
            .duration_ms
            .filter(|ms| *ms > 0)
            .ok_or_else(|| Refusal::NotYet("the file's length is not known yet".to_string()))?;
        let (layout, input) = self.on_disk(manager, watched).await?;
        let arrived = Arrived::new(&layout, duration_ms);
        let held = self.vtt_track(watched, index);
        let mut track = held.lock().await;
        let spans = longest_first(arrived.spans(MARGIN_MS));
        let covered_ms: u64 = spans.iter().map(|span| span.end - span.start).sum();
        let partial = !arrived.whole();
        if let Some(answered) = fresh_enough(&track, covered_ms, partial) {
            return Ok(answered);
        }
        let dir = self.scratch_for(watched).join("subs");
        let read = tokio::task::spawn_blocking(move || read_spans(&input, &dir, index, &spans))
            .await
            .map_err(|_| Refusal::Failed("internal error".to_string()))?;
        let body = cues::merge(&read);
        track.proved_ms = cues::reaches_ms(&body);
        track.read_at = Some(Instant::now());
        let answered = Vtt {
            body: Arc::new(body),
            partial,
        };
        track.answered = Some(answered.clone());
        Ok(answered)
    }

    fn vtt_track(&self, watched: &WatchedFile, index: usize) -> Held {
        Arc::clone(
            self.vtts
                .0
                .lock()
                .unwrap()
                .entry((watched.clone(), index))
                .or_default(),
        )
    }
}

fn fresh_enough(track: &Track, covered_ms: u64, partial: bool) -> Option<Vtt> {
    let answered = track.answered.as_ref()?;
    if !answered.partial {
        return Some(answered.clone());
    }
    if !partial {
        return None;
    }
    if track.read_at.is_some_and(|at| at.elapsed() < REREAD_AFTER) {
        return Some(answered.clone());
    }
    (covered_ms < track.proved_ms.saturating_add(GROWTH_MS)).then(|| answered.clone())
}

fn longest_first(mut spans: Vec<Range<u64>>) -> Vec<Range<u64>> {
    spans.sort_by_key(|span| std::cmp::Reverse(span.end - span.start));
    spans.truncate(MAX_SPANS);
    spans
}

// A span that answers nothing is dropped rather than failing the lot: a film's
// cues are not spread evenly over its runtime.
fn read_spans(input: &Path, dir: &Path, index: usize, spans: &[Range<u64>]) -> Vec<String> {
    let input = input.to_string_lossy().into_owned();
    spans
        .iter()
        .enumerate()
        .filter_map(|(at, span)| {
            let out = dir.join(format!("s{index}-{at}.vtt"));
            let tracks = [(index, out.clone())];
            extract_vtt(&input, &tracks, Some(span.clone()), GIVES_UP_AFTER, &|| {
                false
            })
            .ok()?;
            std::fs::read_to_string(&out).ok()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(proved_ms: u64, partial: bool) -> Track {
        Track {
            answered: Some(Vtt {
                body: Arc::new("WEBVTT\n".to_string()),
                partial,
            }),
            proved_ms,
            read_at: Some(Instant::now() - REREAD_AFTER),
        }
    }

    #[test]
    fn a_track_nobody_has_read_yet_is_never_fresh() {
        let unread = Track::default();

        assert!(fresh_enough(&unread, 0, true).is_none());
    }

    #[test]
    fn a_few_more_seconds_on_disk_are_answered_out_of_what_was_already_read() {
        let track = read(120_000, true);

        assert!(fresh_enough(&track, 121_000, true).is_some());
        assert!(fresh_enough(&track, 120_000 + GROWTH_MS, true).is_none());
    }

    #[test]
    fn a_pass_that_stopped_where_the_bytes_did_is_read_again_though_its_span_was_longer() {
        let cues = "WEBVTT\n\n02:08.000 --> 02:11.000\nthe last cue the bytes held\n";
        let stopped_at_a_hole = Track {
            answered: Some(Vtt {
                body: Arc::new(cues.to_string()),
                partial: true,
            }),
            proved_ms: cues::reaches_ms(cues),
            read_at: Some(Instant::now() - REREAD_AFTER),
        };

        let again = fresh_enough(&stopped_at_a_hole, 213_000, true);

        assert_eq!(stopped_at_a_hole.proved_ms, 131_000);
        assert!(again.is_none(), "the cues trail the arrived span by 80 s");
    }

    #[test]
    fn a_pass_is_never_run_twice_in_a_row_however_far_behind_it_is() {
        let just_read = Track {
            read_at: Some(Instant::now()),
            ..read(131_000, true)
        };

        assert!(fresh_enough(&just_read, 213_000, true).is_some());
    }

    #[test]
    fn a_track_read_from_a_whole_file_is_never_read_again() {
        let done = read(600_000, false);

        assert!(fresh_enough(&done, 658_000, false).is_some());
    }

    #[test]
    fn the_last_piece_landing_is_read_again_however_little_it_added() {
        let track = read(120_000, true);

        assert!(fresh_enough(&track, 120_100, false).is_none());
    }

    #[test]
    fn a_file_arriving_in_pieces_all_over_reads_its_longest_spans_first() {
        let spans = vec![0..10_000, 50_000..90_000, 100_000..120_000];

        let order = longest_first(spans);

        assert_eq!(order, vec![50_000..90_000, 100_000..120_000, 0..10_000]);
    }

    #[test]
    fn no_more_spans_are_read_in_one_call_than_the_cap_allows() {
        let many: Vec<Range<u64>> = (0..30).map(|at| at * 1_000..at * 1_000 + 500).collect();

        let read = longest_first(many);

        assert_eq!(read.len(), MAX_SPANS);
    }
}
