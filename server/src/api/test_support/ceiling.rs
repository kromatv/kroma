use serde_json::json;

use super::{TestApp, demo_item_id, demo_show_id, media_ticket_for, seed_session, test_app};
use crate::db;
use crate::model::{Ceiling, MaturityLevel, Metadata, Permission};

/// A household whose viewer is held at 10+, on a server whose metadata
/// country is the United States. Spirited Away is `PG` and Planet Earth II
/// `TV-G`, so both pass; Blade Runner 2049 is `R`, The Office `TV-14`, and
/// every other demo title is unrated.
pub struct HeldHousehold {
    pub app: TestApp,
    pub viewer: String,
    pub viewer_id: String,
    pub ticket: String,
    pub young_film: String,
    pub old_film: String,
    pub unrated_film: String,
    pub young_show: String,
    pub young_episode: String,
    pub old_show: String,
    pub old_episode: String,
}

pub fn household_where_the_viewer_is_held_at_ten() -> HeldHousehold {
    let app = test_app();
    let (viewer_id, viewer) =
        seed_session(&app.state, "kid@test.dev", "kid", &[Permission::Playback]);
    let old_show = demo_show_id("The Office");
    rate_item(
        &app.state.db,
        &demo_item_id("Spirited Away"),
        &[("US", "PG")],
    );
    rate_item(
        &app.state.db,
        &demo_item_id("Blade Runner 2049"),
        &[("US", "R")],
    );
    rate_show(
        &app.state.db,
        &demo_show_id("Planet Earth II"),
        &[("US", "TV-G")],
    );
    rate_show(&app.state.db, &old_show, &[("US", "TV-14")]);
    hold_at(&app.state.db, &viewer_id, MaturityLevel::Ten);
    let ticket = media_ticket_for(&app.state, &viewer);

    HeldHousehold {
        viewer,
        viewer_id,
        ticket,
        young_film: demo_item_id("Spirited Away"),
        old_film: demo_item_id("Blade Runner 2049"),
        unrated_film: demo_item_id("Big Buck Bunny"),
        young_show: demo_show_id("Planet Earth II"),
        young_episode: demo_item_id("Islands"),
        old_episode: episode_of(&old_show),
        old_show,
        app,
    }
}

pub fn hold_at(pool: &db::Pool, user_id: &str, level: MaturityLevel) {
    db::set_maturity_level(pool, user_id, level).expect("set the maturity level");
}

pub fn rate_item(pool: &db::Pool, item_id: &str, ratings: &[(&str, &str)]) {
    db::set_item_metadata(pool, item_id, &rated(ratings)).expect("rate the item");
}

fn rate_show(pool: &db::Pool, show_id: &str, ratings: &[(&str, &str)]) {
    db::set_show_metadata(pool, show_id, &rated(ratings)).expect("rate the show");
}

/// What enrichment stores on a server whose metadata country is the United
/// States: every country's label, and the household's badge picked from them.
fn rated(ratings: &[(&str, &str)]) -> Metadata {
    let ratings: serde_json::Map<String, serde_json::Value> = ratings
        .iter()
        .map(|(country, label)| (country.to_string(), json!(label)))
        .collect();
    let mut meta: Metadata = serde_json::from_value(json!({
        "tmdbId": 1,
        "title": null,
        "overview": null,
        "genres": [],
        "tmdbUrl": "",
        "ratings": ratings,
    }))
    .expect("a rated metadata blob");
    let household = Ceiling {
        level: MaturityLevel::Adult,
        reader: "US".into(),
        server: "US".into(),
    };
    household.relabel(&mut meta);
    meta
}

fn episode_of(show_id: &str) -> String {
    crate::services::demo::demo_data()
        .items
        .into_iter()
        .find(|i| i.show_id.as_deref() == Some(show_id))
        .map(|i| i.id)
        .expect("an episode of the show")
}
