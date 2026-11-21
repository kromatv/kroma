use super::*;

#[tokio::test]
async fn unlock_answers_that_jellyfin_locks_no_user_and_asks_jellyfin_nothing() {
    let served = served(household());
    let sign_in = served.signed_in().await;
    let calls_before = served.jellyfin.paths().len();
    let ask = json!({ "signIn": sign_in, "server": SERVER, "user": ANA, "pin": "4821" });

    let answer = served.asked("unlock", ask).await;

    assert_eq!(
        answer,
        json!({ "Ok": { "status": "refused", "reason": "notLocked" } })
    );
    assert_eq!(served.jellyfin.paths().len(), calls_before);
}
