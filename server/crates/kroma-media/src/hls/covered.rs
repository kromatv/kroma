use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;

use super::cut::{from_the_second, Cut};
use super::key::same_but_the_anchor;
use super::session::{Session, Sessions};

pub(super) struct Covered {
    pub(super) key: String,
    pub(super) session: Arc<Session>,
    pub(super) playlist: Vec<u8>,
    pub(super) start: f64,
}

#[derive(Default)]
pub(super) struct Serving(Mutex<HashMap<String, String>>);

impl Serving {
    pub(super) async fn answering(&self, asked: &str) -> Option<String> {
        self.0.lock().await.get(asked).cloned()
    }

    pub(super) async fn note(&self, asked: &str, serving: &str) {
        self.0
            .lock()
            .await
            .insert(asked.to_string(), serving.to_string());
    }

    pub(super) async fn forget(&self, asked: &str) {
        self.0.lock().await.remove(asked);
    }

    pub(super) async fn keep_only(&self, live: &HashMap<String, Arc<Session>>) {
        self.0
            .lock()
            .await
            .retain(|_, serving| live.contains_key(serving));
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
        let session = self.inner.lock().await.get(&noted).cloned()?;
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
            if session.start > anchor {
                continue;
            }
            if best
                .as_ref()
                .is_some_and(|held| held.session.start >= session.start)
            {
                continue;
            }
            let Some(cut) = whole_cut(&session, anchor).await else {
                continue;
            };
            best = Some(covered(other, session, cut));
        }
        best
    }
}

fn covered(key: String, session: Arc<Session>, cut: Cut) -> Covered {
    Covered {
        start: session.start + cut.offset,
        key,
        session,
        playlist: cut.playlist.into_bytes(),
    }
}

async fn listed_cut(session: &Session, anchor: f64) -> Option<Cut> {
    let playlist = tokio::fs::read_to_string(session.dir.join("index.m3u8"))
        .await
        .ok()?;
    from_the_second(&playlist, anchor - session.start)
}

async fn whole_cut(session: &Session, anchor: f64) -> Option<Cut> {
    let cut = listed_cut(session, anchor).await?;
    if session.window.is_pruned(cut.sequence) {
        return None;
    }
    tokio::fs::metadata(session.dir.join(&cut.first))
        .await
        .ok()?;
    Some(cut)
}

#[cfg(test)]
mod tests {
    use super::super::naming::session_dir;
    use super::super::session::testing::{registry, LIVE, PLAYLIST};
    use super::*;

    fn produced(sessions: &Sessions, key: &str, playlist: &str) {
        let dir = sessions.root.join(session_dir(key));
        std::fs::write(dir.join("index.m3u8"), playlist).expect("the playlist");
        for name in ["seg_00000.m4s", "seg_00001.m4s", "seg_00002.m4s"] {
            std::fs::write(dir.join(name), b"x").expect("a segment");
        }
    }

    #[tokio::test]
    async fn a_re_anchor_lands_in_the_session_that_already_produced_that_second() {
        let (s, _dir) = registry("covered", 8, &[("itA:copy:0:a0", LIVE)]).await;
        produced(&s, "itA:copy:0:a0", PLAYLIST);

        let covered = s.reuse("itA:copy:12:a0", 12.0).await.expect("the session");

        assert_eq!(covered.key, "itA:copy:0:a0");
        assert_eq!(covered.start, 12.0);
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
        s.serving.note("itA:copy:12:a0", "itA:copy:0:a0").await;
        std::fs::remove_file(
            s.root
                .join(session_dir("itA:copy:0:a0"))
                .join("seg_00002.m4s"),
        )
        .expect("the swept segment");

        let again = s.reuse("itA:copy:12:a0", 12.0).await.expect("the sibling");

        assert_eq!(again.key, "itA:copy:0:a0");
        assert_eq!(again.start, 12.0);
    }

    #[tokio::test]
    async fn a_key_answered_by_another_session_is_forgotten_when_that_one_goes() {
        let serving = Serving::default();
        serving.note("itA:copy:300:a0", "itA:copy:0:a0").await;

        serving.keep_only(&HashMap::new()).await;

        assert_eq!(serving.answering("itA:copy:300:a0").await, None);
    }
}
