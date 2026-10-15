use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use kroma_module_host::HostCtx;
use serde::Serialize;

use crate::api::extract::AuthUser;
use crate::i18n;
use crate::services::capabilities::{self, Offered};
use crate::state::SharedState;

#[derive(Debug, PartialEq, Serialize)]
struct Answer {
    capabilities: Offered,
}

pub fn routes() -> Router<SharedState> {
    Router::new().route("/capabilities", get(list))
}

async fn list(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Json<Answer> {
    let locale = i18n::user_locale(&user);
    let capabilities =
        capabilities::offered(|point| state.contributions(point), &user, locale).await;
    Json(Answer { capabilities })
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;
    use serde_json::json;

    use crate::api::test_support::{
        describing, get, seed_session, test_app, test_app_answering, test_app_contributing,
        TestApp, CONTRIBUTOR,
    };
    use crate::db;
    use crate::model::Permission;

    fn speaking(t: &TestApp, email: &str, language: &str) -> String {
        let (id, token) = seed_session(&t.state, email, email, &[Permission::WatchablePlay]);
        db::set_user_language(&t.state.db, &id, Some(language)).unwrap();
        token
    }

    #[tokio::test]
    async fn a_capability_answers_the_mount_of_whichever_module_contributes_it() {
        let t = test_app_contributing(&["watchable"]);

        let (status, listed) = get(&t.app, "/api/capabilities", Some(&t.token)).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            listed["capabilities"]["watchable"]["mount"],
            json!(format!("/api/module/{CONTRIBUTOR}"))
        );
    }

    #[tokio::test]
    async fn a_capability_nothing_answers_is_absent_rather_than_null() {
        let t = test_app();

        let (status, listed) = get(&t.app, "/api/capabilities", Some(&t.token)).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(listed, json!({ "capabilities": {} }));
    }

    #[tokio::test]
    async fn asking_what_this_server_offers_still_needs_a_session() {
        let t = test_app();

        let (status, _) = get(&t.app, "/api/capabilities", None).await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn a_member_holding_no_permission_at_all_is_past_the_gate() {
        let t = test_app();
        let (_, token) = seed_session(&t.state, "ana@t.dev", "ana", &[]);

        let (status, _) = get(&t.app, "/api/capabilities", Some(&token)).await;

        assert_eq!(status, StatusCode::OK);
    }

    #[tokio::test]
    async fn a_source_carries_what_the_module_says_it_is_and_where_it_is_reached() {
        let t = test_app_answering("watchable", describing()).await;
        let token = speaking(&t, "ed@t.dev", "en");

        let (_, listed) = get(&t.app, "/api/capabilities", Some(&token)).await;

        assert_eq!(
            listed["capabilities"]["watchable"]["sources"],
            json!([{
                "mount": format!("/api/module/{CONTRIBUTOR}"),
                "label": "Torrents",
                "icon": "magnet",
                "figures": [{ "key": "sources", "label": "Peers", "kind": "ratio" }],
                "actions": [],
            }])
        );
    }

    #[tokio::test]
    async fn a_module_is_asked_to_describe_itself_in_the_viewers_own_language() {
        let t = test_app_answering("watchable", describing()).await;
        let token = speaking(&t, "ana@t.dev", "fr");

        let (_, listed) = get(&t.app, "/api/capabilities", Some(&token)).await;

        assert_eq!(
            listed["capabilities"]["watchable"]["sources"][0]["figures"][0]["label"],
            json!("Pairs")
        );
    }

    #[tokio::test]
    async fn a_viewer_granted_the_right_is_offered_the_capability_it_names() {
        let t = test_app_contributing(&["watchable"]);
        let (_, token) = seed_session(&t.state, "ana@t.dev", "ana", &[Permission::WatchablePlay]);

        let (status, listed) = get(&t.app, "/api/capabilities", Some(&token)).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            listed["capabilities"]["watchable"]["mount"],
            json!(format!("/api/module/{CONTRIBUTOR}"))
        );
    }

    #[tokio::test]
    async fn a_viewer_without_the_right_is_offered_nothing_a_module_answers() {
        let t = test_app_contributing(&["watchable"]);
        let (_, token) = seed_session(&t.state, "ed@t.dev", "ed", &[Permission::Playback]);

        let (status, listed) = get(&t.app, "/api/capabilities", Some(&token)).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(listed, json!({ "capabilities": {} }));
    }

    #[tokio::test]
    async fn a_module_that_describes_nothing_is_left_out_of_the_sources_it_cannot_fill() {
        let t = test_app_contributing(&["watchable"]);

        let (_, listed) = get(&t.app, "/api/capabilities", Some(&t.token)).await;

        assert_eq!(
            listed["capabilities"]["watchable"],
            json!({ "mount": format!("/api/module/{CONTRIBUTOR}"), "sources": [] })
        );
    }
}
