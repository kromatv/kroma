use super::*;

use crate::account::FriendServer;
use crate::test_support::mint;

fn me() -> Me {
    Me {
        id: "7001".to_string(),
        name: "Ana".to_string(),
        email: None,
    }
}

fn share(user_id: &str, token: Option<String>) -> Share {
    Share {
        user_id: user_id.to_string(),
        token,
        username: Some(format!("user-{user_id}")),
        email: None,
        all_libraries: false,
        libraries: vec!["1".to_string()],
    }
}

fn listed_users(friends: &[Friend], shares: &[Share]) -> Vec<Person> {
    people(&Listed {
        me: &me(),
        friends,
        shares,
        machine: "machine-1",
        unlocked: &[],
    })
}

#[test]
fn the_owners_own_row_for_the_server_does_not_list_the_owner_twice() {
    let shares = [share("7001", Some(mint("owner")))];

    let users = listed_users(&[], &shares);

    assert_eq!(users.len(), 1);
    assert!(users[0].user.signed_in);
}

#[test]
fn a_person_plex_knows_only_by_a_row_is_named_by_their_username() {
    let shares = [share("7002", Some(mint("reader")))];

    let users = listed_users(&[], &shares);

    assert_eq!(users[1].user.name, "user-7002");
    assert_eq!(users[1].user.libraries, ["1"]);
    assert!(!users[1].user.state_locked);
}

#[test]
fn a_row_with_no_token_has_a_locked_state() {
    let shares = [share("7002", None)];

    let users = listed_users(&[], &shares);

    assert!(users[1].user.state_locked);
    assert_eq!(users[1].user.state_needs, None);
    assert!(users[1].token.is_none());
}

#[test]
fn a_filter_plex_may_add_later_still_counts_as_a_finer_limit() {
    let friend = Friend {
        id: "7002".to_string(),
        filters: vec![
            "label!=adult|studio=Example".to_string(),
            "label=kids".to_string(),
        ],
        ..Friend::default()
    };
    let shares = [share("7002", Some(mint("reader")))];

    let users = listed_users(&[friend], &shares);

    assert_eq!(users[1].user.finer_limits, ["label", "filter"]);
}

#[test]
fn a_home_user_with_a_pin_and_no_row_is_read_with_the_token_the_pin_opened() {
    let dan = Friend {
        id: "7004".to_string(),
        title: Some("Dan".to_string()),
        protected: true,
        servers: vec![FriendServer {
            machine: "machine-1".to_string(),
            all_libraries: true,
            pending: false,
        }],
        ..Friend::default()
    };
    let opened = mint("dan-server");

    let users = people(&Listed {
        me: &me(),
        friends: std::slice::from_ref(&dan),
        shares: &[],
        machine: "machine-1",
        unlocked: &[("7004".to_string(), opened.clone())],
    });

    assert!(!users[1].user.state_locked);
    assert_eq!(users[1].user.state_needs, None);
    assert_eq!(users[1].token, Some(opened));
}
