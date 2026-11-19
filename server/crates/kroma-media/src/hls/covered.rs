use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;

use super::cut::{from_the_second, Cut};
use super::key::same_but_the_anchor;
use super::retime::{shift_of, Shift};
use super::session::{Session, Sessions};

pub(super) struct Covered {
    pub(super) answer: Answer,
    pub(super) session: Arc<Session>,
    pub(super) playlist: Vec<u8>,
    pub(super) start: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Answer {
    pub(super) key: String,
    pub(super) shift: Shift,
}

#[derive(Default)]
pub(super) struct Serving(Mutex<HashMap<String, Answer>>);

impl Serving {
    pub(super) async fn answering(&self, asked: &str) -> Option<Answer> {
        self.0.lock().await.get(asked).cloned()
    }

    pub(super) async fn note(&self, asked: &str, answer: Answer) {
        self.0.lock().await.insert(asked.to_string(), answer);
    }

    pub(super) async fn forget(&self, asked: &str) {
        self.0.lock().await.remove(asked);
    }

    pub(super) async fn keep_only(&self, live: &HashMap<String, Arc<Session>>) {
        self.0
            .lock()
            .await
            .retain(|_, answer| live.contains_key(&answer.key));
    }
}

impl Sessions {
    /// A key that has a session of its own is answered out of it, because that
    /// is where its segment names are served from. A sibling answers only a key
    /// with none, and once one has answered it keeps answering: a second ffmpeg
    /// at this anchor would write the names the viewer is already reading.
    pub(super) async fn reuse(&self, key: &str, anchor: f64) -> Option<Covered> {
        if self.inner.lock().await.contains_key(key) {
            return None;
        }
        match self.noted(key, anchor).await {
            Some(noted) => Some(noted),
            None => self.covering(key, anchor).await,
        }
    }

    async fn noted(&self, key: &str, anchor: f64) -> Option<Covered> {
        let noted = self.serving.answering(key).await?;
        let session = self.inner.lock().await.get(&noted.key).cloned()?;
        let cut = listed_cut(&session, anchor).await?;
        Some(covered(noted, session, cut))
    }

    async fn covering(&self, key: &str, anchor: f64) -> Option<Covered> {
        let siblings: Vec<(String, Arc<Session>)> = {
            let map = self.inner.lock().await;
            map.iter()
                .filter(|(other, _)| other.as_str() != key && same_but_the_anchor(other, key))
                .map(|(other, session)| (other.clone(), session.clone()))
                .collect()
        };
        let mut best: Option<Covered> = None;
        for (other, session) in siblings {
            if session.start.secs() > anchor {
                continue;
            }
            if best
                .as_ref()
                .is_some_and(|held| held.session.start.secs() >= session.start.secs())
            {
                continue;
            }
            let Some((cut, shift)) = whole_cut(&session, anchor).await else {
                continue;
            };
            best = Some(covered(Answer { key: other, shift }, session, cut));
        }
        best
    }
}

fn covered(answer: Answer, session: Arc<Session>, cut: Cut) -> Covered {
    Covered {
        start: session.start.secs() + answer.shift.seconds(),
        answer,
        session,
        playlist: cut.playlist.into_bytes(),
    }
}

async fn listed_cut(session: &Session, anchor: f64) -> Option<Cut> {
    let playlist = tokio::fs::read_to_string(session.dir.join("index.m3u8"))
        .await
        .ok()?;
    from_the_second(&playlist, anchor - session.start.secs())
}

async fn whole_cut(session: &Session, anchor: f64) -> Option<(Cut, Shift)> {
    let cut = listed_cut(session, anchor).await?;
    if session.window.is_pruned(cut.sequence) {
        return None;
    }
    let shift = shift_of(&session.dir, &cut.first).await?;
    Some((cut, shift))
}

#[cfg(test)]
mod tests {
    use super::super::naming::session_dir;
    use super::super::retime::testing::{init, segment_at, shift_at, AUDIO, VIDEO};
    use super::super::session::testing::{registry, LIVE, PLAYLIST};
    use super::*;

    fn produced(sessions: &Sessions, key: &str, playlist: &str) {
        let dir = sessions.root.join(session_dir(key));
        std::fs::write(dir.join("index.m3u8"), playlist).expect("the playlist");
        std::fs::write(dir.join("init.mp4"), init(&[VIDEO, AUDIO])).expect("the init");
        for (index, seconds) in [0, 6, 12].into_iter().enumerate() {
            let name = format!("seg_{index:05}.m4s");
            std::fs::write(dir.join(name), segment_at(seconds)).expect("a segment");
        }
    }

    fn answered_by(key: &str, seconds: u64) -> Answer {
        Answer {
            key: key.to_string(),
            shift: shift_at(seconds),
        }
    }

    #[tokio::test]
    async fn a_re_anchor_lands_in_the_session_that_already_produced_that_second() {
        let (s, _dir) = registry("covered", 8, &[("itA:copy:0:a0", LIVE)]).await;
        produced(&s, "itA:copy:0:a0", PLAYLIST);

        let covered = s.reuse("itA:copy:12:a0", 12.0).await.expect("the session");

        assert_eq!(covered.answer.key, "itA:copy:0:a0");
        assert_eq!(covered.start, 12.0);
    }

    #[tokio::test]
    async fn a_re_anchor_out_of_a_sibling_moves_its_clock_back_to_the_segment_it_begins_on() {
        let (s, _dir) = registry("covered-shift", 8, &[("itA:copy:0:a0", LIVE)]).await;
        produced(&s, "itA:copy:0:a0", PLAYLIST);

        let covered = s.reuse("itA:copy:12:a0", 12.0).await.expect("the session");

        assert_eq!(covered.answer, answered_by("itA:copy:0:a0", 12));
    }

    #[tokio::test]
    async fn a_sibling_whose_segment_carries_no_readable_clock_never_answers() {
        let (s, _dir) = registry("covered-unreadable", 8, &[("itA:copy:0:a0", LIVE)]).await;
        produced(&s, "itA:copy:0:a0", PLAYLIST);
        std::fs::write(
            s.root
                .join(session_dir("itA:copy:0:a0"))
                .join("seg_00002.m4s"),
            b"x",
        )
        .expect("a segment with no fragment");

        let covered = s.reuse("itA:copy:12:a0", 12.0).await;

        assert!(covered.is_none());
    }

    #[tokio::test]
    async fn a_re_anchor_past_what_any_session_has_produced_starts_its_own() {
        let (s, _dir) = registry("covered-past", 8, &[("itA:copy:0:a0", LIVE)]).await;
        produced(&s, "itA:copy:0:a0", PLAYLIST);

        let covered = s.reuse("itA:copy:600:a0", 600.0).await;

        assert!(covered.is_none());
    }

    #[tokio::test]
    async fn a_session_producing_another_mode_never_answers_in_its_place() {
        let (s, _dir) = registry("covered-mode", 8, &[("itA:aac:0:a0", LIVE)]).await;
        produced(&s, "itA:aac:0:a0", PLAYLIST);

        let covered = s.reuse("itA:copy:12:a0", 12.0).await;

        assert!(covered.is_none());
    }

    #[tokio::test]
    async fn a_segment_the_reaper_has_already_taken_is_not_offered_in_its_place() {
        let (s, _dir) = registry("covered-pruned", 8, &[("itA:copy:0:a0", LIVE)]).await;
        produced(&s, "itA:copy:0:a0", PLAYLIST);
        std::fs::remove_file(
            s.root
                .join(session_dir("itA:copy:0:a0"))
                .join("seg_00002.m4s"),
        )
        .expect("the swept segment");

        let covered = s.reuse("itA:copy:12:a0", 12.0).await;

        assert!(covered.is_none());
    }

    #[tokio::test]
    async fn a_key_that_has_a_session_of_its_own_is_never_answered_by_a_sibling() {
        let (s, _dir) = registry(
            "covered-own",
            8,
            &[("itA:copy:0:a0", LIVE), ("itA:copy:12:a0", LIVE)],
        )
        .await;
        produced(&s, "itA:copy:0:a0", PLAYLIST);
        produced(&s, "itA:copy:12:a0", PLAYLIST);

        let reused = s.reuse("itA:copy:12:a0", 12.0).await;

        assert!(reused.is_none());
    }

    #[tokio::test]
    async fn a_sibling_already_answering_a_key_answers_it_after_its_first_segment_is_swept() {
        let (s, _dir) = registry("covered-kept", 8, &[("itA:copy:0:a0", LIVE)]).await;
        produced(&s, "itA:copy:0:a0", PLAYLIST);
        s.serving
            .note("itA:copy:12:a0", answered_by("itA:copy:0:a0", 12))
            .await;
        std::fs::remove_file(
            s.root
                .join(session_dir("itA:copy:0:a0"))
                .join("seg_00002.m4s"),
        )
        .expect("the swept segment");

        let again = s.reuse("itA:copy:12:a0", 12.0).await.expect("the sibling");

        assert_eq!(again.answer.key, "itA:copy:0:a0");
        assert_eq!(again.start, 12.0);
    }

    #[tokio::test]
    async fn a_key_answered_by_another_session_is_forgotten_when_that_one_goes() {
        let serving = Serving::default();
        serving
            .note("itA:copy:300:a0", answered_by("itA:copy:0:a0", 300))
            .await;

        serving.keep_only(&HashMap::new()).await;

        assert_eq!(serving.answering("itA:copy:300:a0").await, None);
    }
}
