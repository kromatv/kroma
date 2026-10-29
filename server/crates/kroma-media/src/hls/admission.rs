use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::time::sleep;

use super::session::{Session, Sessions};

/// Why a program could not be served: `Busy` is this host at its re-encode
/// ceiling, which is worth asking about again, and `Unavailable` is a playlist
/// ffmpeg never produced, which is not.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Refusal {
    Busy,
    Unavailable,
}

pub(super) const SUPERSEDED_TRANSCODE_GRACE: Duration = Duration::from_secs(10);

/// Live video re-encodes this host allows at once, `KROMA_MAX_TRANSCODES`
/// overriding. Half the logical cores, held between 1 and 4: one re-encode is
/// one ffmpeg decoding a whole source, and on a four-thread NAS two of them is
/// the ceiling whatever the session cap says.
pub fn max_live_transcodes() -> usize {
    if let Some(n) = std::env::var("KROMA_MAX_TRANSCODES")
        .ok()
        .and_then(|v| v.trim().parse::<usize>().ok())
        .filter(|n| *n > 0)
    {
        return n;
    }
    let cores = std::thread::available_parallelism()
        .map(std::num::NonZeroUsize::get)
        .unwrap_or(4);
    (cores / 2).clamp(1, 4)
}

impl Sessions {
    pub(super) async fn admits_transcode(&self, map: &mut HashMap<String, Arc<Session>>) -> bool {
        self.reclaim_superseded(map).await;
        live_transcodes(map).await < self.transcode_cap
    }

    pub(super) async fn reclaim_superseded(&self, map: &mut HashMap<String, Arc<Session>>) {
        let now = Instant::now();
        let mut left_behind = Vec::new();
        for (key, session) in map.iter() {
            if session.is_superseded_transcode() && session.idle_past_its_limit(now).await {
                left_behind.push(key.clone());
            }
        }
        for key in left_behind {
            self.evict(map, &key).await;
        }
    }

    pub(super) fn reclaim_superseded_later(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move {
            sleep(SUPERSEDED_TRANSCODE_GRACE).await;
            let mut map = this.inner.lock().await;
            this.reclaim_superseded(&mut map).await;
        });
    }
}

async fn live_transcodes(map: &HashMap<String, Arc<Session>>) -> usize {
    let mut live = 0;
    for session in map.values() {
        if session.transcodes_video() && !session.finished().await {
            live += 1;
        }
    }
    live
}

#[cfg(test)]
mod tests;
