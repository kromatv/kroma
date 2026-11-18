use super::*;

#[test]
fn survey_sends_the_reference_and_the_server_and_reads_what_the_server_holds() {
    let (importers, sent) = answering(json!({ "Ok": {
        "libraries": [{ "id": "1", "name": "Films", "kind": "movies", "folders": ["/data/movies"] }],
        "users": [{ "id": "42", "name": "Ana", "allLibraries": true }],
        "leftBehind": ["playlists"],
    }}));

    let survey = importers.survey(IMPORTER, &server()).unwrap();

    assert_eq!(
        sent_once(&sent),
        (
            "survey".to_string(),
            json!({ "signIn": "s-1", "server": "srv" })
        )
    );
    assert_eq!(survey.libraries[0].folders, vec!["/data/movies"]);
    assert!(survey.users[0].all_libraries);
    assert_eq!(survey.left_behind, vec!["playlists"]);
}

#[test]
fn a_survey_naming_a_user_with_no_id_is_unreadable() {
    let (importers, _) = answering(json!({ "Ok": { "users": [{ "id": "" }] } }));

    let survey = importers.survey(IMPORTER, &server());

    assert_eq!(
        survey,
        Err(Unanswered::Unreadable("an empty user id".into()))
    );
}
