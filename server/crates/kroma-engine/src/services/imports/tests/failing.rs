use serde_json::json;

use super::*;
use crate::model::imports::{FailureReason, Status};
use crate::test_support::test_state;

#[test]
fn an_importer_that_gives_the_same_cursor_again_fails_the_import_and_does_not_loop() {
    let server = household();
    server.change(|household| household.stuck_on_a_cursor = true);
    let state = importing_from(&server);

    let ran = import(&state, &Recording::default(), &kept(&["1"], &[]));

    assert!(ran.result.is_err());
    assert_eq!(ran.import.status, Status::Failed);
    assert_eq!(
        ran.import.failure.map(|failure| failure.reason),
        Some(FailureReason::RepeatedCursor)
    );
    assert_eq!(server.asked("titles").len(), 2);
}

#[test]
fn an_importer_that_fails_part_way_fails_the_import_in_its_own_words() {
    let server = household();
    server.change(|household| household.failing = Some("plays"));
    let state = importing_from(&server);
    let stages = Recording::default();

    let ran = import(&state, &stages, &everything());

    let failure = ran.import.failure.unwrap();
    assert!(ran.result.is_err());
    assert_eq!(ran.import.status, Status::Failed);
    assert_eq!(failure.reason, FailureReason::ImporterFailed);
    assert_eq!(
        failure.message.as_deref(),
        Some("the other server did not answer")
    );
    assert_eq!(ran.import.report.states.brought, 4);
}

#[test]
fn an_answer_this_server_cannot_read_fails_the_import_without_repeating_it() {
    let server = household();
    server.change(|household| household.survey = json!({ "users": [{ "id": "" }] }));
    let state = importing_from(&server);

    let ran = import(&state, &Recording::default(), &everything());

    let failure = ran.import.failure.unwrap();
    assert_eq!(failure.reason, FailureReason::ImporterUnreadable);
    assert_eq!(failure.message, None);
    assert_eq!(
        ran.result.unwrap_err().to_string(),
        "the importer gave an answer this server cannot read"
    );
}

#[test]
fn an_import_whose_importer_is_gone_fails_as_absent() {
    let state = test_state();

    let ran = import(&state, &Recording::default(), &everything());

    assert_eq!(ran.import.status, Status::Failed);
    assert_eq!(
        ran.import.failure.map(|failure| failure.reason),
        Some(FailureReason::ImporterAbsent)
    );
}

#[test]
fn a_stage_that_answers_for_fewer_rows_than_it_was_given_fails_the_import() {
    struct Short;
    impl Stages for Short {
        fn libraries(&self, _: &Importing<'_>, _: &[LibraryRow<'_>]) -> Result<Vec<Outcome>> {
            Ok(Vec::new())
        }
        fn users(&self, _: &Importing<'_>, _: &UserRows<'_>) -> Result<Vec<Outcome>> {
            Ok(Vec::new())
        }
        fn titles(&self, _: &Importing<'_>, _: &TitlePage<'_>) -> Result<Vec<Outcome>> {
            Ok(Vec::new())
        }
        fn states(&self, _: &Importing<'_>, _: &StatePage<'_>) -> Result<Vec<Outcome>> {
            Ok(Vec::new())
        }
        fn plays(&self, _: &Importing<'_>, _: &[PlayRow<'_>]) -> Result<Vec<Outcome>> {
            Ok(Vec::new())
        }
    }
    let state = importing_from(&household());

    let ran = import(&state, &Short, &kept(&["1"], &[]));

    assert_eq!(ran.import.status, Status::Failed);
    assert_eq!(
        ran.import.failure.map(|failure| failure.reason),
        Some(FailureReason::Internal)
    );
}
