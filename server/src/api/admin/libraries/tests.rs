use super::*;

use serde_json::Value;

use crate::model::User;

pub(super) fn user_with(permissions: Vec<Permission>) -> User {
    User {
        id: "u1".into(),
        email: "a@b.c".into(),
        username: "admin".into(),
        avatar_url: None,
        language: None,
        audio_language: None,
        subtitle_language: None,
        permissions,
        created_at: "2024-01-01T00:00:00Z".into(),
        has_pin: false,
    }
}

fn admin() -> User {
    user_with(vec![Permission::LibraryManage])
}

// Returns the whole `TestApp`, not just its `state`: the harness owns the
// data directory's `TempDir`, and keeping only `state` drops it early.
fn app() -> crate::api::test_support::TestApp {
    crate::api::test_support::test_app()
}

fn defs(state: &SharedState) -> Vec<LibraryDef> {
    settings::library_defs(&state.settings, &state.config)
}

async fn create(state: &SharedState, name: &str, folders: Vec<&str>) -> Result<String, Response> {
    let body = CreateLibraryBody {
        name: name.into(),
        kind: Some("movies".into()),
        folders: folders.into_iter().map(String::from).collect(),
    };
    let res = create_library(State(state.clone()), AuthUser(admin()), Json(body)).await?;
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    Ok(v["id"].as_str().unwrap().to_string())
}

#[test]
fn folder_lists_are_trimmed_deduped_and_stripped_of_blanks() {
    assert_eq!(
        clean_folders(vec![
            "  /media/movies  ".into(),
            "".into(),
            "   ".into(),
            "/media/movies".into(),
            "/media/shows".into(),
        ]),
        ["/media/movies", "/media/shows"]
    );
}

#[test]
fn the_first_spelling_of_a_folder_is_the_one_kept() {
    assert_eq!(clean_folders(vec![" /a ".into(), "/a".into(), "/b".into()]), ["/a", "/b"]);
}

#[test]
fn a_list_of_nothing_stays_a_list_of_nothing() {
    assert!(clean_folders(Vec::new()).is_empty());
    assert!(clean_folders(vec!["".into(), "  ".into()]).is_empty());
}

#[tokio::test]
async fn a_created_library_persists_with_its_folders_cleaned() {
    let harness = app();
    let state = harness.state.clone();
    let id = create(&state, "  Films  ", vec![" /media/films ", "", "/media/films"])
        .await
        .unwrap();

    let saved = defs(&state);
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].id, id);
    assert_eq!(saved[0].name, "Films");
    assert_eq!(saved[0].folders, ["/media/films"]);
    assert_eq!(saved[0].kind, "movies");
    assert!(saved[0].auto_scan);
}

#[tokio::test]
async fn every_library_gets_its_own_id() {
    let harness = app();
    let state = harness.state.clone();
    let a = create(&state, "Films", vec!["/a"]).await.unwrap();
    let b = create(&state, "Films", vec!["/b"]).await.unwrap();
    assert_ne!(a, b);
    assert_eq!(defs(&state).len(), 2);
}

#[tokio::test]
async fn a_library_needs_a_name() {
    let harness = app();
    let state = harness.state.clone();
    for blank in ["", "   "] {
        let body = CreateLibraryBody { name: blank.into(), kind: None, folders: Vec::new() };
        let err = create_library(State(state.clone()), AuthUser(admin()), Json(body))
            .await
            .unwrap_err();
        assert_eq!(err.status(), StatusCode::BAD_REQUEST);
    }
    assert!(defs(&state).is_empty(), "a rejected create must not persist anything");
}

#[tokio::test]
async fn creating_a_library_needs_the_permission() {
    let harness = app();
    let state = harness.state.clone();
    let body = CreateLibraryBody { name: "Films".into(), kind: None, folders: Vec::new() };
    let err = create_library(
        State(state.clone()),
        AuthUser(user_with(vec![Permission::Playback, Permission::UsersManage])),
        Json(body),
    )
    .await
    .unwrap_err();
    assert_eq!(err.status(), StatusCode::FORBIDDEN);
    assert!(defs(&state).is_empty());
}

#[tokio::test]
async fn an_update_touches_only_the_fields_it_names() {
    let harness = app();
    let state = harness.state.clone();
    let id = create(&state, "Films", vec!["/media/films"]).await.unwrap();

    let body = UpdateLibraryBody {
        name: Some("Cinéma".into()),
        kind: None,
        folders: None,
        auto_scan: None,
    };
    let res =
        update_library(State(state.clone()), AuthUser(admin()), AxPath(id), Json(body))
            .await
            .unwrap();
    assert_eq!(res.status(), StatusCode::NO_CONTENT);

    let saved = &defs(&state)[0];
    assert_eq!(saved.name, "Cinéma");
    assert_eq!(saved.kind, "movies");
    assert_eq!(saved.folders, ["/media/films"]);
    assert!(saved.auto_scan);
}

#[tokio::test]
async fn an_update_can_turn_auto_scan_off_without_touching_anything_else() {
    let harness = app();
    let state = harness.state.clone();
    let id = create(&state, "Films", vec!["/media/films"]).await.unwrap();

    let body = UpdateLibraryBody {
        name: None,
        kind: None,
        folders: None,
        auto_scan: Some(false),
    };
    update_library(State(state.clone()), AuthUser(admin()), AxPath(id), Json(body))
        .await
        .unwrap();

    let saved = &defs(&state)[0];
    assert!(!saved.auto_scan);
    assert_eq!(saved.name, "Films");
}

#[tokio::test]
async fn a_blank_new_name_is_ignored_rather_than_applied() {
    let harness = app();
    let state = harness.state.clone();
    let id = create(&state, "Films", vec!["/media/films"]).await.unwrap();

    let body = UpdateLibraryBody {
        name: Some("   ".into()),
        kind: None,
        folders: None,
        auto_scan: None,
    };
    update_library(State(state.clone()), AuthUser(admin()), AxPath(id), Json(body))
        .await
        .unwrap();

    assert_eq!(defs(&state)[0].name, "Films");
}

#[tokio::test]
async fn replacing_the_folders_cleans_them_too() {
    let harness = app();
    let state = harness.state.clone();
    let id = create(&state, "Films", vec!["/media/films"]).await.unwrap();

    let body = UpdateLibraryBody {
        name: None,
        kind: Some("shows".into()),
        folders: Some(vec![" /media/shows ".into(), "".into(), "/media/shows".into()]),
        auto_scan: None,
    };
    update_library(State(state.clone()), AuthUser(admin()), AxPath(id), Json(body))
        .await
        .unwrap();

    let saved = &defs(&state)[0];
    assert_eq!(saved.folders, ["/media/shows"]);
    assert_eq!(saved.kind, "shows");
}

#[tokio::test]
async fn editing_a_library_that_is_not_there_is_a_404() {
    let harness = app();
    let state = harness.state.clone();
    create(&state, "Films", vec!["/media/films"]).await.unwrap();

    let body = UpdateLibraryBody {
        name: Some("Ghost".into()),
        kind: None,
        folders: None,
        auto_scan: None,
    };
    let err = update_library(
        State(state.clone()),
        AuthUser(admin()),
        AxPath("no-such-library".into()),
        Json(body),
    )
    .await
    .unwrap_err();
    assert_eq!(err.status(), StatusCode::NOT_FOUND);

    let saved = defs(&state);
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].name, "Films");
}

#[tokio::test]
async fn deleting_removes_that_library_and_leaves_the_others() {
    let harness = app();
    let state = harness.state.clone();
    let films = create(&state, "Films", vec!["/media/films"]).await.unwrap();
    let shows = create(&state, "Séries", vec!["/media/shows"]).await.unwrap();

    let res = delete_library(State(state.clone()), AuthUser(admin()), AxPath(films))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NO_CONTENT);

    let saved = defs(&state);
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].id, shows);
}

#[tokio::test]
async fn deleting_a_library_that_is_not_there_is_a_404() {
    let harness = app();
    let state = harness.state.clone();
    create(&state, "Films", vec!["/media/films"]).await.unwrap();
    let err =
        delete_library(State(state.clone()), AuthUser(admin()), AxPath("ghost".into()))
            .await
            .unwrap_err();
    assert_eq!(err.status(), StatusCode::NOT_FOUND);
    assert_eq!(defs(&state).len(), 1);
}

#[tokio::test]
async fn deleting_needs_the_permission() {
    let harness = app();
    let state = harness.state.clone();
    let id = create(&state, "Films", vec!["/media/films"]).await.unwrap();
    let err = delete_library(
        State(state.clone()),
        AuthUser(user_with(vec![Permission::Playback])),
        AxPath(id),
    )
    .await
    .unwrap_err();
    assert_eq!(err.status(), StatusCode::FORBIDDEN);
    assert_eq!(defs(&state).len(), 1, "a refused delete must not remove anything");
}

#[tokio::test]
async fn a_scan_can_be_kicked_by_hand_and_is_gated() {
    let harness = app();
    let state = harness.state.clone();
    let res = scan_library(State(state.clone()), AuthUser(admin()), AxPath("any".into()))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let err = scan_library(
        State(state.clone()),
        AuthUser(user_with(vec![Permission::Playback])),
        AxPath("any".into()),
    )
    .await
    .unwrap_err();
    assert_eq!(err.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn the_list_reports_every_library_with_a_zeroed_card() {
    let harness = app();
    let state = harness.state.clone();
    create(&state, "Films", vec!["/media/films"]).await.unwrap();

    let res = list_libraries(State(state.clone()), AuthUser(admin())).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
    let v: Value = serde_json::from_slice(&bytes).unwrap();

    let libs = v["libraries"].as_array().unwrap();
    assert_eq!(libs.len(), 1);
    assert_eq!(libs[0]["name"], "Films");
    assert_eq!(libs[0]["kind"], "film");
    assert_eq!(libs[0]["itemCount"], 0);
    assert_eq!(libs[0]["sizeBytes"], 0);
    assert_eq!(libs[0]["autoScan"], true);
}

#[tokio::test]
async fn the_list_is_open_to_any_admin_not_just_a_library_manager() {
    let harness = app();
    let state = harness.state.clone();
    let res =
        list_libraries(State(state.clone()), AuthUser(user_with(vec![Permission::UsersManage])))
            .await
            .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let err =
        list_libraries(State(state.clone()), AuthUser(user_with(vec![Permission::Playback])))
            .await
            .unwrap_err();
    assert_eq!(err.status(), StatusCode::FORBIDDEN);
}

#[test]
fn a_library_kind_becomes_the_icon_the_card_renders() {
    let of = |kind: &str| {
        kind_label(
            &LibraryDef {
                id: "l1".into(),
                name: "L".into(),
                kind: kind.into(),
                folders: Vec::new(),
                auto_scan: true,
            },
            None,
        )
    };
    assert_eq!(of("shows"), "tv");
    assert_eq!(of("movies"), "film");
    assert_eq!(of("music"), "music");
    assert_eq!(of("photo"), "photo");
    assert_eq!(of(""), "film");
    assert_eq!(of("something-new"), "film");
}
