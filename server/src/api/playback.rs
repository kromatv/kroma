//! Playback endpoints: the live-session heartbeats that feed the admin
//! dashboard. All require a session, and every one that names an item refuses an
//! item the caller's library grant does not cover (ACCT-21).

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post, put};
use axum::Router;

use crate::state::SharedState;

mod heartbeat;
mod progress;
mod up_next;
mod watch_state;

/// Playback progress / resume, watched markers, "Ma liste", up-next and the
/// live-session heartbeats that feed the admin dashboard.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/shows/{id}/up-next", get(up_next::up_next))
        .route("/items/{id}/next", get(up_next::next_episode))
        .route("/items/{id}/following", get(up_next::following_episodes))
        .route("/progress", get(progress::list_progress))
        .route("/continue", get(progress::continue_watching))
        .route(
            "/progress/{id}",
            get(progress::get_progress)
                .put(progress::save_progress)
                .delete(progress::delete_progress),
        )
        .route("/watched", get(watch_state::list_watched))
        .route(
            "/watched/{id}",
            put(watch_state::mark_watched).delete(watch_state::unmark_watched),
        )
        .route("/my-list", get(watch_state::list_my_list))
        .route(
            "/my-list/{id}",
            put(watch_state::add_to_list).delete(watch_state::remove_from_list),
        )
        .route(
            "/playback/ping",
            post(heartbeat::ping).layer(DefaultBodyLimit::max(heartbeat::MAX_BEAT_BYTES)),
        )
        .route(
            "/playback/stop",
            post(heartbeat::stop).layer(DefaultBodyLimit::max(heartbeat::MAX_BEAT_BYTES)),
        )
}
