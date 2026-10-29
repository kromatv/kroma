//! Whether this host starts another re-encode, and what it takes back first.
//!
//! A stream copy costs a file read; a re-encode decodes every frame of the
//! source, so a 4K title pulled at `-readrate 2.0` is the dearest thing in the
//! delivery path. [`super::reclaim`] is the general sweep. This is the narrow one
//! that does not wait for its next tick, and the ceiling past which a program is
//! refused rather than started.

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

// What a superseded re-encode is given before it is taken: long enough for a
// second viewer still reading it to clear the mark with their next request,
// short enough that a seek does not leave a whole 4K decode running for a
// minute. A superseded stream COPY keeps the longer grace, because it costs the
// box a file read and its segments are worth re-anchoring into.
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
    // False means every slot is held by a stream someone is still reading, and
    // the caller must refuse rather than queue or take one away.
    pub(super) async fn admits_transcode(&self, map: &mut HashMap<String, Arc<Session>>) -> bool {
        self.reclaim_superseded(map).await;
        live_transcodes(map).await < self.transcode_cap
    }

    // The reaper's own idle rule, narrowed to the sessions this exists for and
    // run without waiting for its next tick.
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

    // A viewer who seeks and then stops asking would otherwise leave a decode
    // running until the reaper's next tick.
    pub(super) fn reclaim_superseded_later(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move {
            sleep(SUPERSEDED_TRANSCODE_GRACE).await;
            let mut map = this.inner.lock().await;
            this.reclaim_superseded(&mut map).await;
        });
    }
}

// A session whose ffmpeg has exited holds no slot: it is a directory waiting to
// be reaped, not a decode.
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
