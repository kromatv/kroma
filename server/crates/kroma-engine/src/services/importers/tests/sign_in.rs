use super::*;

#[test]
fn connect_sends_the_form_the_owner_filled_and_reads_the_sign_in_it_gets_back() {
    let (importers, sent) = answering(json!({ "Ok": {
        "status": "ready",
        "signIn": "s-1",
        "servers": [{ "id": "srv", "name": "Living room" }],
    }}));

    let answer = importers.connect(
        IMPORTER,
        &form(&[("url", "http://nas:8096"), ("password", "x")]),
    );

    assert_eq!(
        sent_once(&sent),
        (
            "connect".to_string(),
            json!({ "fields": { "url": "http://nas:8096", "password": "x" } })
        )
    );
    assert_eq!(
        answer,
        Ok(Connected::Ready {
            sign_in: "s-1".into(),
            servers: vec![Server {
                id: "srv".into(),
                name: "Living room".into(),
                address: None,
            }],
        })
    );
}

#[test]
fn connect_asks_again_with_the_id_of_the_sign_in_in_progress_and_nothing_else() {
    let (importers, sent) = answering(json!({ "Ok": {
        "status": "pending",
        "pending": "p-7",
        "url": "https://account.example/link",
    }}));
    let again = ConnectAsk {
        fields: BTreeMap::new(),
        pending: Some("p-7".into()),
    };

    let answer = importers.connect(IMPORTER, &again);

    assert_eq!(
        sent_once(&sent),
        ("connect".to_string(), json!({ "pending": "p-7" }))
    );
    assert_eq!(
        answer,
        Ok(Connected::Pending {
            pending: "p-7".into(),
            url: "https://account.example/link".into(),
            expires_at: None,
        })
    );
}

#[test]
fn a_sign_in_link_that_is_not_https_is_not_handed_to_the_owner() {
    for url in [
        "javascript:alert(1)",
        "http://account.example/link",
        "https://a b",
    ] {
        let (importers, _) = answering(json!({ "Ok": {
            "status": "pending",
            "pending": "p-7",
            "url": url,
        }}));

        let answer = importers.connect(IMPORTER, &form(&[]));

        assert!(matches!(answer, Err(Unanswered::Unreadable(_))), "{url}");
    }
}

#[test]
fn a_refusal_keeps_its_reason_and_a_bounded_message() {
    let (importers, _) = answering(json!({ "Ok": {
        "status": "refused",
        "reason": "credentials",
        "message": "n".repeat(MAX_REASON_CHARS + 50),
    }}));

    let answer = importers.connect(IMPORTER, &form(&[("password", "wrong")]));

    assert_eq!(
        answer,
        Ok(Connected::Refused {
            reason: RefusalReason::Credentials,
            message: Some("n".repeat(MAX_REASON_CHARS)),
        })
    );
}

#[test]
fn a_ready_sign_in_with_no_reference_is_unreadable() {
    let (importers, _) = answering(json!({ "Ok": { "status": "ready", "signIn": "" } }));

    let answer = importers.connect(IMPORTER, &form(&[]));

    assert_eq!(
        answer,
        Err(Unanswered::Unreadable("an empty sign-in id".into()))
    );
}

#[test]
fn forget_names_the_sign_in_and_takes_any_answer_that_is_not_a_failure() {
    let (importers, sent) = answering(json!({ "Ok": null }));
    let (refusing, _) = answering(json!({ "Err": "the database is locked" }));
    let ask = ForgetAsk {
        sign_in: "s-1".into(),
    };

    let forgotten = importers.forget(IMPORTER, &ask);
    let kept = refusing.forget(IMPORTER, &ask);

    assert_eq!(
        sent_once(&sent),
        ("forget".to_string(), json!({ "signIn": "s-1" }))
    );
    assert_eq!(forgotten, Ok(()));
    assert_eq!(
        kept,
        Err(Unanswered::Failed("the database is locked".into()))
    );
}
