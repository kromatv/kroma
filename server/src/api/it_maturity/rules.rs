use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{
    HeldHousehold, PASSWORD, get, hold_at, household_where_the_viewer_is_held_at_ten, seed_session,
    seed_session_pw, send,
};
use crate::model::{MaturityLevel, Permission};

fn admin(h: &HeldHousehold) -> String {
    let rights = [Permission::UsersManage, Permission::Playback];
    seed_session_pw(&h.app.state, "admin@test.dev", "admin", PASSWORD, &rights).1
}

async fn rule_on(
    h: &HeldHousehold,
    (admin, profile): (&str, &str),
    (title, rule): (&str, Value),
) -> StatusCode {
    let uri = format!("/api/admin/users/{profile}/restrictions/titles/{title}");
    let body = Some(json!({ "rule": rule, "password": PASSWORD }));
    send(&h.app.app, "PUT", &uri, Some(admin), body).await.0
}

async fn status_of(h: &HeldHousehold, uri: &str) -> StatusCode {
    get(&h.app.app, uri, Some(&h.viewer)).await.0
}

#[tokio::test]
async fn a_blocked_show_is_kept_with_every_episode_even_at_eighteen() {
    let h = household_where_the_viewer_is_held_at_ten();
    let admin = admin(&h);
    hold_at(&h.app.state.db, &h.viewer_id, MaturityLevel::Adult);

    let set = rule_on(&h, (&admin, &h.viewer_id), (&h.young_show, json!("block"))).await;

    assert_eq!(set, StatusCode::NO_CONTENT);
    let (_, shows) = get(&h.app.app, "/api/shows", Some(&h.viewer)).await;
    assert!(!shows.to_string().contains(&h.young_show), "{shows}");
    for uri in [
        format!("/api/shows/{}", h.young_show),
        format!("/api/items/{}", h.young_episode),
    ] {
        assert_eq!(status_of(&h, &uri).await, StatusCode::NOT_FOUND, "{uri}");
    }
    let (_, found) = get(&h.app.app, "/api/search?q=Planet", Some(&h.viewer)).await;
    assert_eq!(found["results"], json!([]));
}

#[tokio::test]
async fn an_allowed_unrated_film_passes_the_ceiling_for_that_profile_alone() {
    let h = household_where_the_viewer_is_held_at_ten();
    let admin = admin(&h);
    let rights = [Permission::Playback];
    let (sibling_id, sibling) = seed_session(&h.app.state, "sib@test.dev", "sib", &rights);
    hold_at(&h.app.state.db, &sibling_id, MaturityLevel::Ten);
    let uri = format!("/api/items/{}", h.unrated_film);

    let set = rule_on(
        &h,
        (&admin, &h.viewer_id),
        (&h.unrated_film, json!("allow")),
    )
    .await;

    assert_eq!(set, StatusCode::NO_CONTENT);
    assert_eq!(status_of(&h, &uri).await, StatusCode::OK);
    let (sibling_status, _) = get(&h.app.app, &uri, Some(&sibling)).await;
    assert_eq!(sibling_status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_title_is_blocked_or_allowed_never_both_and_lifting_the_rule_restores_the_ceiling() {
    let h = household_where_the_viewer_is_held_at_ten();
    let admin = admin(&h);
    let uri = format!("/api/items/{}", h.old_film);
    let restrictions = format!("/api/admin/users/{}/restrictions", h.viewer_id);

    rule_on(&h, (&admin, &h.viewer_id), (&h.old_film, json!("block"))).await;
    rule_on(&h, (&admin, &h.viewer_id), (&h.old_film, json!("allow"))).await;
    let allowed = status_of(&h, &uri).await;
    let (_, listed) = get(&h.app.app, &restrictions, Some(&admin)).await;
    rule_on(&h, (&admin, &h.viewer_id), (&h.old_film, Value::Null)).await;
    let lifted = status_of(&h, &uri).await;

    assert_eq!(allowed, StatusCode::OK);
    assert_eq!(
        listed["titles"],
        json!([{ "id": h.old_film, "name": "Blade Runner 2049", "kind": "movie", "rule": "allow" }])
    );
    assert_eq!(lifted, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_rule_takes_the_admins_password_and_names_a_whole_title_of_another_profile() {
    let h = household_where_the_viewer_is_held_at_ten();
    let admin = admin(&h);
    let uri = format!(
        "/api/admin/users/{}/restrictions/titles/{}",
        h.viewer_id, h.old_film
    );
    let wrong = Some(json!({ "rule": "block", "password": "not-it" }));

    let (unproven, _) = send(&h.app.app, "PUT", &uri, Some(&admin), wrong).await;
    let episode = rule_on(&h, (&admin, &h.viewer_id), (&h.old_episode, json!("block"))).await;
    let by_the_profile =
        rule_on(&h, (&h.viewer, &h.viewer_id), (&h.old_film, json!("allow"))).await;

    assert_eq!(unproven, StatusCode::UNAUTHORIZED);
    assert_eq!(episode, StatusCode::NOT_FOUND);
    assert_eq!(by_the_profile, StatusCode::FORBIDDEN);
}
