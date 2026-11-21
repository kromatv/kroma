use super::*;

#[test]
fn an_unlocked_user_is_one_status_and_nothing_else() {
    let wire = json!({ "status": "unlocked" });

    let answer: Unlock = read(wire.clone());

    assert_eq!(answer, Unlock::Unlocked);
    assert_eq!(serde_json::to_value(&answer).unwrap(), wire);
}

#[test]
fn a_pin_the_other_server_did_not_take_is_a_refusal_with_its_reason() {
    let wire = json!({ "status": "refused", "reason": "pin", "message": "wrong PIN" });

    let answer: Unlock = read(wire.clone());

    assert_eq!(
        answer,
        Unlock::Refused {
            reason: UnlockRefusal::Pin,
            message: Some("wrong PIN".into()),
        }
    );
    assert_eq!(serde_json::to_value(&answer).unwrap(), wire);
}

#[test]
fn an_unlock_refused_for_a_reason_this_build_does_not_know_reads_as_other() {
    let known: Unlock = read(json!({ "status": "refused", "reason": "notLocked" }));
    let newer: Unlock = read(json!({ "status": "refused", "reason": "tooManyTries" }));
    let bare: Unlock = read(json!({ "status": "refused" }));

    let reasons = [known, newer, bare].map(|answer| match answer {
        Unlock::Refused { reason, .. } => reason,
        Unlock::Unlocked => panic!("a refusal reads as one"),
    });

    assert_eq!(
        reasons,
        [
            UnlockRefusal::NotLocked,
            UnlockRefusal::Other,
            UnlockRefusal::Other
        ]
    );
}
