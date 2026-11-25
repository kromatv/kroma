use std::time::Duration;

use super::*;

const SALON: &str = "tv-salon-01";

fn device(id: &str) -> ScreenDevice {
    ScreenDevice {
        id: id.to_string(),
        name: "Salon".to_string(),
        platform: "Tizen".to_string(),
    }
}

fn from(user_id: &str, connection: u64) -> Origin<'_> {
    Origin {
        user_id,
        connection,
    }
}

fn blank() -> Screen {
    Screen {
        fibers: 3,
        truncated: false,
        rows: Vec::new(),
    }
}

fn reply(request_id: &str) -> ScreenReply {
    ScreenReply {
        request_id: request_id.to_string(),
        screen: blank(),
    }
}

#[test]
fn a_screen_is_listed_for_its_own_account_only() {
    let screens = Screens::default();

    assert!(screens.hello(from("alice", 1), device(SALON)));

    assert_eq!(screens.roster("alice"), vec![device(SALON)]);
    assert!(screens.roster("bob").is_empty());
}

#[test]
fn a_malformed_id_is_not_listed() {
    let screens = Screens::default();

    assert!(!screens.hello(from("alice", 1), device("short")));

    assert!(screens.roster("alice").is_empty());
}

#[test]
fn a_name_and_a_platform_are_cleaned_and_cut() {
    let screens = Screens::default();
    let mut said = device(SALON);
    said.name = format!("Sal\non{}", "x".repeat(100));

    screens.hello(from("alice", 1), said);

    let listed = &screens.roster("alice")[0];
    assert!(!listed.name.contains('\n'));
    assert_eq!(listed.name.chars().count(), MAX_NAME);
}

#[test]
fn a_later_hello_on_a_new_connection_replaces_the_old_one() {
    let screens = Screens::default();
    screens.hello(from("alice", 1), device(SALON));

    screens.hello(from("alice", 2), device(SALON));
    screens.forget(1);

    assert_eq!(screens.roster("alice"), vec![device(SALON)]);
}

#[test]
fn an_account_lists_a_bounded_number_of_screens() {
    let screens = Screens::default();
    for n in 0..MAX_SCREENS_PER_USER {
        let id = format!("tv-screen-{n:02}");
        assert!(screens.hello(from("alice", n as u64 + 1), device(&id)));
    }

    let past = screens.hello(from("alice", 999), device("tv-one-too-many"));

    assert!(!past);
    assert_eq!(screens.roster("alice").len(), MAX_SCREENS_PER_USER);
}

#[test]
fn another_accounts_screen_is_refused_like_a_missing_one() {
    let screens = Screens::default();
    screens.hello(from("alice", 1), device(SALON));

    let foreign = screens.ask("bob", SALON).err();
    let missing = screens.ask("alice", "tv-nowhere-1").err();

    assert_eq!(foreign, Some(Refused::Unknown));
    assert_eq!(missing, Some(Refused::Unknown));
}

#[test]
fn open_requests_are_bounded_per_account_and_closed_when_dropped() {
    let screens = Screens::default();
    screens.hello(from("alice", 1), device(SALON));
    let open: Vec<_> = (0..MAX_PENDING_PER_USER)
        .map(|_| screens.ask("alice", SALON).expect("room"))
        .collect();

    let busy = screens.ask("alice", SALON).err();
    drop(open);

    assert_eq!(busy, Some(Refused::Busy));
    assert!(screens.ask("alice", SALON).is_ok());
}

#[tokio::test]
async fn the_connection_that_said_hello_answers_and_no_other() {
    let screens = Screens::default();
    screens.hello(from("alice", 1), device(SALON));
    let mut asked = screens.ask("alice", SALON).expect("asked");
    let id = asked.request_id().to_string();

    let stranger = screens.answer(from("alice", 2), reply(&id));
    let other_account = screens.answer(from("bob", 1), reply(&id));
    let own = screens.answer(from("alice", 1), reply(&id));

    assert!(!stranger);
    assert!(!other_account);
    assert!(own);
    assert_eq!(asked.answer(Duration::from_secs(1)).await, Some(blank()));
}

#[tokio::test]
async fn a_request_ends_when_its_screen_goes_away() {
    let screens = Screens::default();
    screens.hello(from("alice", 1), device(SALON));
    let mut asked = screens.ask("alice", SALON).expect("asked");

    screens.forget(1);

    assert_eq!(asked.answer(Duration::from_secs(5)).await, None);
    assert!(screens.roster("alice").is_empty());
}

#[tokio::test]
async fn a_request_nobody_answers_times_out() {
    let screens = Screens::default();
    screens.hello(from("alice", 1), device(SALON));
    let mut asked = screens.ask("alice", SALON).expect("asked");

    let answer = asked.answer(Duration::from_millis(20)).await;

    assert_eq!(answer, None);
}

#[test]
fn a_reply_for_no_open_request_is_ignored() {
    let screens = Screens::default();
    screens.hello(from("alice", 1), device(SALON));

    assert!(!screens.answer(from("alice", 1), reply("not-a-request")));
}
