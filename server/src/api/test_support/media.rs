use super::{
    demo_item_id, demo_library_ids, grant_libraries, media_ticket_for, seed_session, test_app,
    TestApp,
};
use crate::model::Permission;

pub const FILM: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

pub struct Household {
    pub app: TestApp,
    pub viewer: String,
    pub ticket: String,
    pub episode: String,
}

pub fn household_where_the_viewer_only_sees_films() -> Household {
    let app = test_app();
    let (viewer_id, viewer) = seed_session(
        &app.state,
        "viewer@test.dev",
        "viewer",
        &[Permission::Playback],
    );
    let (movies_lib, _shows_lib) = demo_library_ids();
    grant_libraries(&app.state, &viewer_id, &[movies_lib]);
    let ticket = media_ticket_for(&app.state, &viewer);

    Household {
        app,
        viewer,
        ticket,
        episode: demo_item_id("Islands"),
    }
}

pub fn byte_routes(item: &str) -> Vec<String> {
    vec![
        format!("/api/items/{item}/stream"),
        format!("/api/items/{item}/hls/copy/0/0/index.m3u8"),
        format!("/api/items/{item}/hls/copy/0/0/init.mp4"),
        format!("/api/items/{item}/storyboard"),
        format!("/api/items/{item}/storyboard.img"),
        format!("/api/items/{item}/subtitles/0"),
        format!("/api/items/{item}/subtitles/dl/anything.vtt"),
    ]
}

pub fn ticketed(uri: &str, ticket: &str) -> String {
    let join = if uri.contains('?') { '&' } else { '?' };
    format!("{uri}{join}t={ticket}")
}

pub fn device_of(h: &Household) -> String {
    crate::db::session_device_id(&h.app.state.db, &h.viewer)
        .expect("read the session's device")
        .expect("a session minted from an access token")
}
