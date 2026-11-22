use super::*;

async fn refusal(response: Result<String, Response>) -> (StatusCode, Value) {
    let response = response.unwrap_err();
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

async fn moved(state: &SharedState, id: &str, folders: &[&str]) -> Result<String, Response> {
    let body = UpdateLibraryBody {
        name: None,
        kind: None,
        folders: Some(folders.iter().map(ToString::to_string).collect()),
        auto_scan: None,
    };
    update_library(
        State(state.clone()),
        AuthUser(admin()),
        AxPath(id.into()),
        Json(body),
    )
    .await
    .map(|_| id.to_string())
}

fn names(state: &SharedState) -> Vec<String> {
    defs(state).into_iter().map(|def| def.name).collect()
}

#[tokio::test]
async fn a_library_over_a_folder_above_another_librarys_is_refused_with_its_name() {
    let harness = app();
    let state = harness.state.clone();
    create(&state, "Films 4K", vec!["/media/Films/4K"])
        .await
        .unwrap();

    let refused = create(&state, "Films", vec!["/media/Films"]).await;

    let (status, answer) = refusal(refused).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(answer["code"], "error.libraryFoldersShared");
    assert!(answer["error"]
        .as_str()
        .is_some_and(|error| error.contains("Films 4K")));
    assert_eq!(names(&state), ["Films 4K"]);
}

#[tokio::test]
async fn a_library_over_a_folder_below_another_librarys_is_refused() {
    let harness = app();
    let state = harness.state.clone();
    create(&state, "Films", vec!["/media/Films"]).await.unwrap();

    let refused = create(&state, "Films 4K", vec!["/media/Films/4K/"]).await;

    assert_eq!(refusal(refused).await.0, StatusCode::CONFLICT);
    assert_eq!(names(&state), ["Films"]);
}

#[tokio::test]
async fn a_folder_whose_name_only_starts_like_another_is_a_library_of_its_own() {
    let harness = app();
    let state = harness.state.clone();
    create(&state, "Films", vec!["/media/Films"]).await.unwrap();

    create(&state, "Films 4K", vec!["/media/Films 4K"])
        .await
        .unwrap();

    assert_eq!(names(&state), ["Films", "Films 4K"]);
}

#[tokio::test]
async fn an_edit_that_moves_a_library_over_another_librarys_files_is_refused() {
    let harness = app();
    let state = harness.state.clone();
    create(&state, "Films", vec!["/media/Films"]).await.unwrap();
    let series = create(&state, "Séries", vec!["/media/Series"])
        .await
        .unwrap();

    let refused = moved(&state, &series, &["/media/Series", "/media"]).await;

    let (status, answer) = refusal(refused).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(answer["error"]
        .as_str()
        .is_some_and(|error| error.contains("Films")));
    assert_eq!(defs(&state)[1].folders, ["/media/Series"]);
}

#[tokio::test]
async fn an_edit_may_add_a_folder_below_the_librarys_own() {
    let harness = app();
    let state = harness.state.clone();
    let films = create(&state, "Films", vec!["/media/Films"]).await.unwrap();

    moved(&state, &films, &["/media/Films", "/media/Films/4K"])
        .await
        .unwrap();

    assert_eq!(defs(&state)[0].folders, ["/media/Films", "/media/Films/4K"]);
}

#[tokio::test]
async fn libraries_that_already_share_files_can_still_be_saved_as_they_are() {
    let harness = app();
    let state = harness.state.clone();
    let overlapping = vec![
        LibraryDef {
            id: "films".into(),
            name: "Films".into(),
            kind: "movies".into(),
            folders: vec!["/media/Films".into()],
            auto_scan: true,
        },
        LibraryDef {
            id: "films-4k".into(),
            name: "Films 4K".into(),
            kind: "movies".into(),
            folders: vec!["/media/Films/4K".into()],
            auto_scan: true,
        },
    ];
    settings::set_library_defs(&state.settings, &state.db, &overlapping);

    moved(&state, "films-4k", &["/media/Films/4K"])
        .await
        .unwrap();
    let grown = moved(&state, "films-4k", &["/media/Films/4K", "/media"]).await;

    assert_eq!(refusal(grown).await.0, StatusCode::CONFLICT);
    assert_eq!(defs(&state).len(), 2);
}
