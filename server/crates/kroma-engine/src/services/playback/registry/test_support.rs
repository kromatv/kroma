use std::time::{Duration, Instant};

use crate::db::testing::TempPool;
use crate::model::MediaItem;

use super::{Beat, Ping, Registry};

pub fn test_pool() -> TempPool {
    crate::db::testing::temp_pool("playback-reg")
}

pub fn ping(session_id: &str, pos: i64, state: &str) -> Ping {
    Ping {
        session_id: session_id.into(),
        item_id: "item1".into(),
        position_ms: pos,
        duration_ms: Some(100_000),
        state: state.into(),
        mode: "direct".into(),
        player: "web".into(),
        device: "Chrome".into(),
        audio: None,
        subtitle: None,
    }
}

/// One beat from Alice on the LAN, for a session `user` holds, or a signed-out
/// one where `user` is `None`. Every test that is not about who owns a session
/// or where it is being watched from opens one through here.
pub fn beat(reg: &Registry, ping: Ping, user: Option<&str>) -> Beat {
    beat_for(reg, ping, user, None)
}

pub fn beat_for(
    reg: &Registry,
    ping: Ping,
    user: Option<&str>,
    item: Option<&MediaItem>,
) -> Beat {
    reg.upsert(
        ping,
        user.map(str::to_owned),
        "Alice".into(),
        "ip".into(),
        "LAN".into(),
        item,
    )
}

// The log only takes a session that played, so a fixture has to beat twice
// with time between: one beat opens the session, the rewind and the second
// fold that interval into its playing time.
pub fn played_for(reg: &Registry, id: &str, secs: u64, item: Option<&MediaItem>) {
    beat_apart(reg, id, secs, item, |pos| ping(id, pos, "playing"));
}

pub fn beat_apart(
    reg: &Registry,
    id: &str,
    secs: u64,
    item: Option<&MediaItem>,
    beat: impl Fn(i64) -> Ping,
) {
    beat_for(reg, beat(0), Some("u1"), item);
    rewind(reg, id, secs);
    beat_for(reg, beat((secs as i64) * 1000), Some("u1"), item);
}

/// Backdate a live session's last beat, which is how a test reaches both the
/// played-time accounting and the reaper without waiting.
pub fn rewind(reg: &Registry, id: &str, secs: u64) {
    let mut map = reg.inner.write().unwrap();
    let entry = map.get_mut(id).expect("the session was just opened");
    entry.last_seen = Instant::now() - Duration::from_secs(secs);
}
