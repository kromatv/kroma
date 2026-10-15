use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::watch;
use tokio::time::Instant;

use kroma_module_sdk::media::probe::{probe_input, ProbeResult};

use crate::downloads::Offer;
use crate::DownloadManager;

use super::file::WatchedFile;
use super::source::Refusal;
use super::Watch;

const ANSWER_WITHIN: Duration = Duration::from_secs(20);
const INDEX_WITHIN: Duration = Duration::from_secs(12);
const GIVES_UP_AFTER: Duration = Duration::from_secs(10 * 60);

#[derive(Clone)]
enum Probed {
    Running,
    Unreadable,
    Read(Arc<ProbeResult>),
}

impl Probed {
    fn settled(&self) -> bool {
        !matches!(self, Self::Running)
    }
}

#[derive(Default)]
pub struct Probes {
    answered: Mutex<HashMap<WatchedFile, Arc<ProbeResult>>>,
    running: Mutex<HashMap<WatchedFile, watch::Receiver<Probed>>>,
}

impl Probes {
    pub(super) fn downloads(&self) -> HashSet<String> {
        self.answered
            .lock()
            .unwrap()
            .keys()
            .map(|watched| watched.download.clone())
            .collect()
    }

    pub(super) fn forget(&self, downloads: &HashSet<String>) {
        self.answered
            .lock()
            .unwrap()
            .retain(|watched, _| !downloads.contains(&watched.download));
        self.running
            .lock()
            .unwrap()
            .retain(|watched, _| !downloads.contains(&watched.download));
    }
}

impl Watch {
    /// What ffprobe found in `watched`, probed once and kept, within one wait of
    /// `ANSWER_WITHIN` that the container index gets `INDEX_WITHIN` of.
    ///
    /// A [`Refusal::NotYet`] leaves the ffprobe running.
    pub async fn probe(
        &self,
        manager: &Arc<DownloadManager>,
        watched: &WatchedFile,
    ) -> Result<Arc<ProbeResult>, Refusal> {
        let answer_by = Instant::now() + ANSWER_WITHIN;
        // Before the answer already read, so a download the catalogue has taken
        // over stops being described rather than answering out of memory.
        offered(manager, watched).await?;
        if let Some(found) = self.already_read(watched) {
            return Ok(found);
        }
        let ticket = self.ticket(manager, watched).await?;
        ticket.index.clone().settled(INDEX_WITHIN).await;
        self.read(watched, &self.read_from(&ticket), answer_by)
            .await
    }

    fn already_read(&self, watched: &WatchedFile) -> Option<Arc<ProbeResult>> {
        self.probes.answered.lock().unwrap().get(watched).cloned()
    }

    async fn read(
        &self,
        watched: &WatchedFile,
        input: &str,
        answer_by: Instant,
    ) -> Result<Arc<ProbeResult>, Refusal> {
        if let Some(found) = self.already_read(watched) {
            return Ok(found);
        }
        let mut joined = self.join_or_start(watched, input);
        let _ = tokio::time::timeout_at(answer_by, joined.wait_for(Probed::settled)).await;
        let settled = joined.borrow().clone();
        let probed = match settled {
            Probed::Running => {
                return Err(Refusal::NotYet(
                    "the file's first bytes have not arrived yet".to_string(),
                ))
            }
            Probed::Unreadable => {
                self.probes.running.lock().unwrap().remove(watched);
                return Err(Refusal::NotYet(
                    "this file holds nothing that can be played".to_string(),
                ));
            }
            Probed::Read(probed) => probed,
        };
        self.probes.running.lock().unwrap().remove(watched);
        self.probes
            .answered
            .lock()
            .unwrap()
            .insert(watched.clone(), Arc::clone(&probed));
        Ok(probed)
    }

    fn join_or_start(&self, watched: &WatchedFile, input: &str) -> watch::Receiver<Probed> {
        let mut running = self.probes.running.lock().unwrap();
        if let Some(joined) = running.get(watched) {
            return joined.clone();
        }
        let (sender, receiver) = watch::channel(Probed::Running);
        running.insert(watched.clone(), receiver.clone());
        let input = input.to_string();
        tokio::spawn(async move {
            let read = probe_input(&input, GIVES_UP_AFTER)
                .await
                .filter(describes_a_stream)
                .map(|probed| Probed::Read(Arc::new(probed)))
                .unwrap_or(Probed::Unreadable);
            let _ = sender.send(read);
        });
        receiver
    }
}

/// Whether the listing still offers `watched`: that the index names a video file
/// of a download the module will serve bytes for, rather than a file of one that
/// has since been imported or a track nothing plays. A play token says a viewer
/// holds one, which is a different question, so anything that reads the file asks
/// this first rather than trusting a token or a probe read earlier.
///
/// A [`Refusal::NotYet`] is worth asking again; a [`Refusal::Unknown`] never is.
pub(super) async fn offered(
    manager: &Arc<DownloadManager>,
    watched: &WatchedFile,
) -> Result<(), Refusal> {
    match offer(manager, watched).await? {
        Offer::File => Ok(()),
        Offer::NoSuchFile => Err(Refusal::Unknown(format!(
            "this download offers no file {}",
            watched.file
        ))),
        Offer::Never => Err(Refusal::Unknown(
            "this download is not one to watch while it arrives".to_string(),
        )),
        Offer::NotYet => Err(Refusal::NotYet(
            "the download has no file list yet".to_string(),
        )),
    }
}

async fn offer(manager: &Arc<DownloadManager>, watched: &WatchedFile) -> Result<Offer, Refusal> {
    let (manager, asked) = (Arc::clone(manager), watched.clone());
    tokio::task::spawn_blocking(move || manager.offer(&asked.download, asked.file))
        .await
        .map_err(|_| Refusal::Failed("internal error".to_string()))?
        .map_err(|e| Refusal::Failed(format!("{e:#}")))
}

fn describes_a_stream(probed: &ProbeResult) -> bool {
    probed.video.is_some() || !probed.audio_tracks.is_empty()
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::domain::VideoStream;
    use kroma_module_sdk::host::testing::StubHost;

    use super::super::test_support::watch_engine;
    use super::*;

    const NOTHING_ANSWERS: &str = "http://127.0.0.1:1/clip.mp4";

    fn watched(file: usize) -> WatchedFile {
        WatchedFile::new("d1".into(), file).unwrap()
    }

    fn h264() -> ProbeResult {
        ProbeResult {
            video: Some(VideoStream {
                codec: "h264".into(),
                width: Some(1920),
                height: Some(1080),
                hdr: false,
                bit_depth: None,
                hdr_format: None,
                dolby_vision_profile: None,
                color: None,
            }),
            ..ProbeResult::default()
        }
    }

    #[test]
    fn a_file_with_no_picture_and_no_soundtrack_is_not_an_answer() {
        assert!(describes_a_stream(&h264()));
        assert!(!describes_a_stream(&ProbeResult::default()));
    }

    #[test]
    fn what_a_download_that_has_gone_left_behind_is_forgotten() {
        let probes = Probes::default();
        let mut answered = probes.answered.lock().unwrap();
        answered.insert(watched(0), Arc::new(h264()));
        answered.insert(watched(1), Arc::new(h264()));
        answered.insert(WatchedFile::new("d2".into(), 0).unwrap(), Arc::new(h264()));
        drop(answered);

        probes.forget(&HashSet::from(["d1".to_string()]));

        assert_eq!(probes.downloads(), HashSet::from(["d2".to_string()]));
    }

    #[tokio::test]
    async fn one_ffprobe_runs_per_file_however_many_calls_ask_for_it() {
        let host = StubHost::new();
        let engine = watch_engine(&host);

        let first = engine.join_or_start(&watched(0), NOTHING_ANSWERS);
        let again = engine.join_or_start(&watched(0), NOTHING_ANSWERS);
        let other = engine.join_or_start(&watched(1), NOTHING_ANSWERS);

        assert!(first.same_channel(&again));
        assert!(!first.same_channel(&other));
        assert_eq!(engine.probes.running.lock().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn an_answer_already_read_is_handed_back_without_probing_again() {
        let host = StubHost::new();
        let engine = watch_engine(&host);
        engine
            .probes
            .answered
            .lock()
            .unwrap()
            .insert(watched(0), Arc::new(h264()));

        let found = engine
            .read(&watched(0), NOTHING_ANSWERS, Instant::now())
            .await;

        let codec = found
            .ok()
            .and_then(|p| p.video.as_ref().map(|v| v.codec.clone()));
        assert_eq!(codec, Some("h264".to_string()));
        assert!(engine.probes.running.lock().unwrap().is_empty());
    }
}
