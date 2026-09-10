//! The catalog JSON the core answers with, and the account a session resolves
//! to, as every test here reads them.

use serde_json::{json, Value};

use kroma_module_sdk::domain::{LibraryScope, User};

pub fn movie() -> Value {
    json!({
        "id": "m1", "kind": "movie", "title": "Dune", "year": 2021,
        "container": "mov,mp4,m4a,3gp,3g2,mj2",
        "metadata": { "overview": "Spice.", "backdropUrl": "https://img/dune.jpg" }
    })
}

pub fn episode() -> Value {
    json!({
        "id": "e3", "kind": "episode", "title": "Chapter 3", "showId": "s1",
        "showTitle": "Andor", "season": 1, "episode": 3, "episodeTitle": "Reckoning",
        "container": "matroska,webm"
    })
}

pub fn show() -> Value {
    json!({ "id": "s1", "title": "Andor", "year": 2022, "episodeCount": 12 })
}

pub fn user(language: Option<&str>) -> User {
    User {
        id: "u1".into(),
        email: "ana@kroma.tv".into(),
        username: "ana".into(),
        avatar_url: None,
        language: language.map(str::to_string),
        audio_language: None,
        subtitle_language: None,
        permissions: Vec::new(),
        libraries: LibraryScope::All,
        created_at: "2026-01-01T00:00:00Z".into(),
        has_pin: false,
    }
}
