use serde_json::{Value, json};

use super::creating::kids_profile;
use crate::api::test_support::{TestApp, get, seed_session, test_app};
use crate::model::Permission;

fn adult(t: &TestApp, tag: &str) -> (String, String) {
    seed_session(
        &t.state,
        &format!("{tag}@test.dev"),
        tag,
        &[Permission::Playback],
    )
}

async fn inbox(t: &TestApp, token: &str) -> Vec<Value> {
    let (_, read) = get(&t.app, "/api/notifications", Some(token)).await;
    read["notifications"].as_array().cloned().unwrap_or_default()
}

#[tokio::test]
async fn a_new_kids_profile_tells_every_other_adult_without_a_pin_how_to_set_one() {
    let t = test_app();
    let (_, ana) = adult(&t, "ana");
    let (ben_id, ben) = adult(&t, "ben");
    crate::db::set_user_pin(&t.state.db, &ben_id, Some("hash")).unwrap();

    kids_profile(&t, "Léo").await;

    let told = inbox(&t, &ana).await;
    assert_eq!(told.len(), 1, "{told:?}");
    assert_eq!(told[0]["link"], json!("/account?section=security&pin=set"));
    assert_eq!(told[0]["actions"][0]["href"], json!("/account?section=security&pin=set"));
    assert_eq!(inbox(&t, &ben).await, Vec::<Value>::new());
    assert_eq!(inbox(&t, &t.token).await, Vec::<Value>::new());
}

#[tokio::test]
async fn an_adult_is_told_once_however_many_kids_profiles_follow() {
    let t = test_app();
    let (_, ana) = adult(&t, "ana");

    kids_profile(&t, "Léo").await;
    kids_profile(&t, "Mia").await;

    assert_eq!(inbox(&t, &ana).await.len(), 1);
}
