use super::*;

#[test]
fn an_importer_s_own_failure_comes_back_in_its_words_and_bounded() {
    let (importers, _) = answering(json!({ "Err": "the other server did not answer" }));
    let (wordy, _) = answering(json!({ "Err": "e".repeat(MAX_REASON_CHARS * 4) }));

    let said = importers.survey(IMPORTER, &server());
    let clipped = wordy.survey(IMPORTER, &server());

    assert_eq!(
        said,
        Err(Unanswered::Failed("the other server did not answer".into()))
    );
    assert_eq!(
        clipped,
        Err(Unanswered::Failed("e".repeat(MAX_REASON_CHARS)))
    );
}

#[test]
fn an_answer_that_is_not_the_contract_s_is_unreadable() {
    let (bare, _) = answering(json!({ "libraries": [] }));
    let (wrong, _) = answering(json!({ "Ok": { "libraries": "none" } }));

    assert!(matches!(
        bare.survey(IMPORTER, &server()),
        Err(Unanswered::Unreadable(_))
    ));
    assert!(matches!(
        wrong.survey(IMPORTER, &server()),
        Err(Unanswered::Unreadable(_))
    ));
}

#[test]
fn an_importer_that_is_not_running_is_absent() {
    let (importers, sent) = answering(json!({ "Ok": {} }));
    let nobody = Importers::new(Point::absent(POINT));

    let other = importers.survey("tv.x.not-installed", &server());
    let none = nobody.survey(IMPORTER, &server());

    assert_eq!(other, Err(Unanswered::Absent));
    assert_eq!(none, Err(Unanswered::Absent));
    assert!(sent.lock().unwrap().is_empty());
    assert!(nobody.answering().is_empty());
    assert_eq!(importers.answering(), vec![IMPORTER]);
}
