use std::collections::BTreeMap;

use serde_json::json;

use super::*;

fn a_saved_list_that_does_not_read(state: &SharedState) -> Value {
    let saved = json!([{ "name": "Films" }]);
    state.settings.set_patch(
        &state.db,
        BTreeMap::from([("libraries".to_string(), saved.clone())]),
    );
    saved
}

fn renamed() -> UpdateLibraryBody {
    UpdateLibraryBody {
        name: Some("Cinema".into()),
        kind: None,
        folders: None,
        auto_scan: None,
    }
}

#[tokio::test]
async fn a_saved_list_that_cannot_be_read_is_reported_to_the_libraries_page() {
    let harness = app();
    let state = harness.state.clone();
    a_saved_list_that_does_not_read(&state);

    let listed = list_libraries(State(state.clone()), AuthUser(admin()))
        .await
        .unwrap_err();

    assert_eq!(listed.status(), StatusCode::CONFLICT);
    let body = axum::body::to_bytes(listed.into_body(), usize::MAX)
        .await
        .unwrap();
    let answer: Value = serde_json::from_slice(&body).unwrap();
    assert!(answer["error"]
        .as_str()
        .is_some_and(|error| error.contains("cannot be read")));
}

#[tokio::test]
async fn no_edit_replaces_a_saved_list_that_cannot_be_read() {
    let harness = app();
    let state = harness.state.clone();
    let saved = a_saved_list_that_does_not_read(&state);

    let created = create(&state, "Films", vec!["/media/films"]).await;
    let updated = update_library(
        State(state.clone()),
        AuthUser(admin()),
        AxPath("lib-1".into()),
        Json(renamed()),
    )
    .await;
    let deleted = delete_library(
        State(state.clone()),
        AuthUser(admin()),
        AxPath("lib-1".into()),
    )
    .await;

    for refused in [
        created.map(|_| ()),
        updated.map(|_| ()),
        deleted.map(|_| ()),
    ] {
        assert_eq!(
            refused.map_err(|response| response.status()),
            Err(StatusCode::CONFLICT)
        );
    }
    assert_eq!(state.settings.get("libraries"), saved);
}
