//! Appending an ended session to the play-history log.

use crate::db::Pool;

use super::Session;

/// Append one ended session to the play-history log; best-effort. Everything the
/// card showed is written with it: once the session is reaped there is nowhere
/// left to learn who watched this, on what, or whether the box re-encoded it.
///
/// A session that never played is not a viewing and is dropped. That is the
/// server's own guard rather than a client's promise: a background tab is
/// clamped to about one beat a minute, so its session is reaped between beats
/// and the next one opens another, and one such tab left open wrote sixteen
/// thousand rows before anybody noticed.
pub fn record(pool: &Pool, s: &Session) {
    if s.played_ms <= 0 {
        return;
    }
    let ended = unix_now();
    let some = |v: &str| (!v.is_empty()).then(|| v.to_owned());
    let _ = crate::db::record_play(
        pool,
        &kroma_domain::PlayRecord {
            user_id: s.user_id.clone(),
            username: Some(s.username.clone()),
            item_id: Some(s.item_id.clone()),
            kind: s.kind.clone(),
            title: s.title.clone(),
            library: some(&s.library),
            show_title: s.show_title.clone(),
            season: s.season,
            episode: s.episode,
            device: some(&s.device),
            player: some(&s.player),
            mode: some(&s.mode),
            network: some(&s.network),
            video_label: some(&s.video_label),
            audio_label: some(&s.audio_label),
            started_at: s.started_at,
            ended_at: ended,
            watched_ms: s.played_ms,
        },
    );
}

pub(super) fn unix_now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

#[cfg(test)]
mod tests;
