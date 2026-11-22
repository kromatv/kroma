use crate::domain::import::{Unlock, UnlockRefusal};

use super::*;

const PIN: &str = "4821";

fn for_ana(pin: &str) -> UnlockAsk {
    UnlockAsk {
        sign_in: "s-1".into(),
        server: "srv".into(),
        user: "44".into(),
        pin: pin.into(),
    }
}

fn holds_the_pin(answer: &Result<Unlock, Unanswered>) -> bool {
    format!("{answer:?}").contains(PIN)
}

#[test]
fn unlock_sends_the_user_and_the_pin_once_and_reads_that_the_user_is_unlocked() {
    let (importers, sent) = answering(json!({ "Ok": { "status": "unlocked" } }));

    let answer = importers.unlock(IMPORTER, &for_ana(PIN));

    assert_eq!(
        sent_once(&sent),
        (
            "unlock".to_string(),
            json!({ "signIn": "s-1", "server": "srv", "user": "44", "pin": PIN })
        )
    );
    assert_eq!(answer, Ok(Unlock::Unlocked));
}

#[test]
fn a_pin_the_other_server_did_not_take_is_an_answer_with_its_reason() {
    let (importers, _) = answering(json!({ "Ok": { "status": "refused", "reason": "pin" } }));

    let answer = importers.unlock(IMPORTER, &for_ana("0000"));

    assert_eq!(
        answer,
        Ok(Unlock::Refused {
            reason: UnlockRefusal::Pin,
            message: None,
        })
    );
}

#[test]
fn a_pin_that_is_empty_or_too_long_is_refused_without_asking_the_importer() {
    let (importers, sent) = answering(json!({ "Ok": { "status": "unlocked" } }));

    let empty = importers.unlock(IMPORTER, &for_ana(""));
    let long = importers.unlock(IMPORTER, &for_ana(&"9".repeat(MAX_PIN_CHARS + 1)));

    let refused = Ok(Unlock::Refused {
        reason: UnlockRefusal::Pin,
        message: None,
    });
    assert_eq!(empty, refused);
    assert_eq!(long, refused);
    assert!(sent.lock().unwrap().is_empty());
}

#[test]
fn the_pin_is_taken_out_of_whatever_the_importer_says_back() {
    let answers = [
        json!({ "Err": format!("plex.tv refused {PIN}") }),
        json!({ "Ok": { "status": "refused", "reason": "pin", "message": format!("{PIN} is wrong") } }),
        json!({ "Ok": { "status": PIN } }),
    ];

    for answer in answers {
        let (importers, _) = answering(answer.clone());

        let said = importers.unlock(IMPORTER, &for_ana(PIN));

        assert!(!holds_the_pin(&said), "{answer} gave {said:?}");
        assert!(said != Ok(Unlock::Unlocked), "{answer}");
    }
}
