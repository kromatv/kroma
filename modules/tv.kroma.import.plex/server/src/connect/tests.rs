use super::*;

use crate::store;
use crate::test_support::{filled, get, mint, post, Household, ACCOUNT, MACHINE};
use crate::wire::{Refusal, ServerRef};

const PIN: &str = include_str!("../../fixtures/account/pin.xml");
const NOW: i64 = 1_700_000_000;
const PINS: &str = "https://plex.tv/api/v2/pins";
const THE_PIN: &str = "https://plex.tv/api/v2/pins/4242";

fn pin(code: &str, auth_token: &str) -> String {
    let values = [
        ("pin_id", "4242"),
        ("code", code),
        ("auth_token", auth_token),
    ];
    filled(PIN, &values)
}

fn started(home: &Household) -> (String, String) {
    let code = mint("code");
    home.web.answers(post(PINS), 201, &pin(&code, ""));
    let Connected::Pending { pending, .. } =
        home.plex.connect(&ConnectAsk::default(), NOW).unwrap()
    else {
        panic!("a sign-in that starts is pending");
    };
    (pending, code)
}

fn asked_again(home: &Household, pending: &str, now: i64) -> Connected {
    let ask = ConnectAsk {
        pending: Some(pending.to_string()),
    };
    home.plex.connect(&ask, now).unwrap()
}

fn refused(reason: Refusal) -> Connected {
    Connected::Refused { reason }
}

#[test]
fn starting_a_sign_in_answers_the_plex_page_to_open_and_when_to_stop_asking() {
    let home = Household::new();
    let code = mint("code");
    home.web.answers(post(PINS), 201, &pin(&code, ""));

    let answer = home.plex.connect(&ConnectAsk::default(), NOW).unwrap();

    let client = store::client_id(&home.pool).unwrap();
    let Connected::Pending {
        pending,
        url,
        expires_at,
    } = answer
    else {
        panic!("a sign-in that starts is pending");
    };
    assert_eq!(
        url,
        format!("https://app.plex.tv/auth#?clientID={client}&code={code}&context%5Bdevice%5D%5Bproduct%5D=KROMA")
    );
    assert_eq!(expires_at, NOW + 15 * 60);
    assert!(store::pending(&home.pool, &pending).unwrap().is_some());
}

#[test]
fn the_pin_request_names_this_install_and_asks_for_a_strong_code() {
    let home = Household::new();

    started(&home);

    let client = store::client_id(&home.pool).unwrap();
    let sent = &home.web.asked(PINS)[0];
    assert_eq!(sent.method, "POST");
    assert_eq!(sent.value("strong"), Some("true"));
    assert_eq!(sent.value("X-Plex-Product"), Some("KROMA"));
    assert_eq!(
        sent.value("X-Plex-Client-Identifier"),
        Some(client.as_str())
    );
    assert_eq!(sent.value("X-Plex-Token"), None);
}

#[test]
fn asking_again_before_the_owner_approves_answers_the_same_wait() {
    let home = Household::new();
    let (pending, code) = started(&home);
    home.web.answers(get(THE_PIN), 200, &pin(&code, ""));

    let answer = asked_again(&home, &pending, NOW + 30);

    let Connected::Pending {
        pending: again,
        expires_at,
        ..
    } = answer
    else {
        panic!("an unapproved sign-in is still pending");
    };
    assert_eq!(again, pending);
    assert_eq!(expires_at, NOW + 15 * 60);
    assert_eq!(
        home.web.asked(THE_PIN)[0].value("code"),
        Some(code.as_str())
    );
}

#[test]
fn an_approved_sign_in_is_kept_and_names_the_servers_the_account_owns() {
    let home = Household::new();
    let (pending, code) = started(&home);
    home.web
        .answers(get(THE_PIN), 200, &pin(&code, &home.account_token));

    let answer = asked_again(&home, &pending, NOW + 30);

    let Connected::Ready { sign_in, servers } = answer else {
        panic!("an approved sign-in is ready");
    };
    let kept = store::sign_in(&home.pool, &sign_in).unwrap().unwrap();
    assert_eq!(
        servers,
        vec![ServerRef {
            id: MACHINE.to_string(),
            name: "NAS".to_string(),
            address: Some("https://192.168.1.20:32400".to_string()),
        }]
    );
    assert_eq!(kept.token, home.account_token);
    assert_eq!(kept.account_id, "7001");
    assert_eq!(
        store::server(&home.pool, home.key(&sign_in))
            .unwrap()
            .unwrap()
            .token,
        home.owner_token
    );
}

#[test]
fn asking_again_once_it_is_ready_answers_the_same_sign_in() {
    let home = Household::new();
    let (pending, code) = started(&home);
    home.web
        .answers(get(THE_PIN), 200, &pin(&code, &home.account_token));
    let first = asked_again(&home, &pending, NOW + 30);

    let second = asked_again(&home, &pending, NOW + 31);

    assert_eq!(second, first);
    assert_eq!(home.web.asked(THE_PIN).len(), 1);
}

#[test]
fn an_account_that_owns_no_server_is_refused_and_its_token_is_not_kept() {
    let home = Household::new();
    let (pending, code) = started(&home);
    home.web
        .answers(get(THE_PIN), 200, &pin(&code, &home.account_token));
    home.web.answers(
        get(&format!("{ACCOUNT}/api/v2/resources")).with("X-Plex-Token", &home.account_token),
        200,
        r#"<resources><resource name="Cabin" clientIdentifier="friend-machine" provides="server" owned="0" accessToken="not-used"/></resources>"#,
    );

    let answer = asked_again(&home, &pending, NOW + 30);

    let kept: i64 = home
        .pool
        .get()
        .unwrap()
        .query_row("SELECT count(*) FROM sign_ins", (), |row| row.get(0))
        .unwrap();
    assert_eq!(answer, refused(Refusal::NotAdministrator));
    assert_eq!(kept, 0);
    assert!(store::pending(&home.pool, &pending).unwrap().is_none());
}

#[test]
fn a_pin_plex_no_longer_knows_is_refused_as_expired() {
    let home = Household::new();
    let (pending, _) = started(&home);
    home.web.answers(get(THE_PIN), 404, "<errors/>");

    let answer = asked_again(&home, &pending, NOW + 30);

    assert_eq!(answer, refused(Refusal::Expired));
    assert!(store::pending(&home.pool, &pending).unwrap().is_none());
}

#[test]
fn a_pending_id_the_importer_does_not_know_is_refused_as_expired() {
    let home = Household::new();

    let answer = asked_again(&home, "p-7", NOW);

    assert_eq!(answer, refused(Refusal::Expired));
    assert!(home.web.seen().is_empty());
}

#[test]
fn a_sign_in_nobody_finished_in_time_is_refused_as_expired_without_asking_plex() {
    let home = Household::new();
    let (pending, _) = started(&home);

    let answer = asked_again(&home, &pending, NOW + 15 * 60);

    assert_eq!(answer, refused(Refusal::Expired));
    assert!(home.web.asked(THE_PIN).is_empty());
}

#[test]
fn plex_not_answering_at_the_start_is_refused_as_unreachable() {
    let home = Household::new();
    home.web.is_silent(post(PINS));

    let answer = home.plex.connect(&ConnectAsk::default(), NOW).unwrap();

    assert_eq!(answer, refused(Refusal::Unreachable));
}

#[test]
fn plex_turning_the_pin_request_down_is_refused_as_other() {
    let home = Household::new();
    home.web.answers(post(PINS), 429, "<errors/>");

    let answer = home.plex.connect(&ConnectAsk::default(), NOW).unwrap();

    assert_eq!(answer, refused(Refusal::Other));
}

#[test]
fn plex_not_answering_while_the_owner_signs_in_keeps_the_sign_in_waiting() {
    let home = Household::new();
    let (pending, _) = started(&home);
    home.web.is_silent(get(THE_PIN));

    let answer = asked_again(&home, &pending, NOW + 30);

    assert!(matches!(answer, Connected::Pending { .. }));
}

#[test]
fn plex_being_busy_while_the_owner_signs_in_keeps_the_sign_in_waiting() {
    let home = Household::new();
    let (pending, _) = started(&home);
    home.web.answers(get(THE_PIN), 503, "Service Unavailable");

    let answer = asked_again(&home, &pending, NOW + 30);

    assert!(matches!(answer, Connected::Pending { .. }));
    assert!(store::pending(&home.pool, &pending).unwrap().is_some());
}

#[test]
fn plex_refusing_the_question_while_the_owner_signs_in_ends_the_sign_in() {
    let home = Household::new();
    let (pending, _) = started(&home);
    home.web.answers(get(THE_PIN), 400, "<errors/>");

    let answer = asked_again(&home, &pending, NOW + 30);

    assert_eq!(answer, refused(Refusal::Other));
}

#[test]
fn plex_not_answering_right_after_the_approval_keeps_the_sign_in_waiting() {
    let home = Household::new();
    let (pending, code) = started(&home);
    home.web
        .answers(get(THE_PIN), 200, &pin(&code, &home.account_token));
    home.web.is_silent(
        get(&format!("{ACCOUNT}/api/v2/resources")).with("X-Plex-Token", &home.account_token),
    );

    let answer = asked_again(&home, &pending, NOW + 30);

    assert!(matches!(answer, Connected::Pending { .. }));
    assert!(store::pending(&home.pool, &pending).unwrap().is_some());
}
