use super::*;

use crate::test_support::{get, Household, ACCOUNT, LOCAL, LOCAL_PLAIN, MACHINE, RELAY, REMOTE};

fn connection(uri: &str, address: &str) -> Connection {
    Connection {
        uri: uri.to_string(),
        protocol: Some("https".to_string()),
        address: Some(address.to_string()),
        port: Some(32400),
        local: false,
        relay: false,
    }
}

fn local(uri: &str, address: &str) -> Connection {
    Connection {
        local: true,
        ..connection(uri, address)
    }
}

fn relay(uri: &str, address: &str) -> Connection {
    Connection {
        relay: true,
        ..connection(uri, address)
    }
}

fn identity_of(machine: &str) -> String {
    format!(r#"<MediaContainer machineIdentifier="{machine}"/>"#)
}

fn lost(home: &Household, sign_in: &str) {
    crate::store::set_route(&home.pool, home.key(sign_in), None).unwrap();
}

#[test]
fn tries_the_local_address_first_then_the_remote_one_then_the_relay() {
    let listed = [
        relay(RELAY, "198.51.100.7"),
        connection(REMOTE, "203.0.113.9"),
        local(LOCAL, "192.168.1.20"),
    ];

    let order = candidates(&listed);

    assert_eq!(order, [LOCAL, LOCAL_PLAIN, REMOTE, RELAY]);
}

#[test]
fn never_tries_plain_http_outside_the_local_network() {
    let listed = [
        connection("http://203.0.113.9:32400", "203.0.113.9"),
        relay("http://198.51.100.7:8443", "198.51.100.7"),
    ];

    let order = candidates(&listed);

    assert!(order.is_empty());
}

#[test]
fn leaves_out_a_name_the_manifest_does_not_declare() {
    let listed = [
        connection("https://plex.example.org:443", "203.0.113.9"),
        connection("https://plex.direct.example.org:443", "203.0.113.9"),
        local("https://nas.example.org:32400", "192.168.1.20"),
    ];

    let order = candidates(&listed);

    assert_eq!(order, [LOCAL_PLAIN]);
}

#[test]
fn leaves_out_an_address_that_is_not_a_plain_url() {
    let listed = [
        local(
            "https://user@192-168-1-20.examplehash.plex.direct:32400",
            "192.168.1.20/x",
        ),
        local("ftp://192.168.1.20", "nas"),
        local("https://192-168-1-20.examplehash.plex.direct:32400 ", "::1"),
    ];

    let order = candidates(&listed);

    assert!(order.is_empty());
}

#[test]
fn lists_one_address_once() {
    let listed = [
        local("http://192.168.1.20:32400", "192.168.1.20"),
        local("http://192.168.1.20:32400/", "192.168.1.20"),
    ];

    let order = candidates(&listed);

    assert_eq!(order, [LOCAL_PLAIN]);
}

#[test]
fn finds_the_server_at_the_first_address_that_answers_as_it_and_keeps_it() {
    let (home, sign_in) = Household::signed_in();
    lost(&home, &sign_in);

    let first = home.plex.reach(home.key(&sign_in)).unwrap().base;
    let second = home.plex.reach(home.key(&sign_in)).unwrap().base;

    assert_eq!(first, LOCAL);
    assert_eq!(second, LOCAL);
    assert_eq!(
        home.web.asked(&format!("{ACCOUNT}/api/v2/resources")).len(),
        1
    );
}

#[test]
fn passes_over_an_address_that_answers_as_another_server() {
    let (home, sign_in) = Household::signed_in();
    lost(&home, &sign_in);
    home.web.answers(
        get(&format!("{LOCAL}/identity")),
        200,
        &identity_of("someone-else"),
    );
    home.web.answers(
        get(&format!("{REMOTE}/identity")),
        200,
        &identity_of(MACHINE),
    );

    let reached = home.plex.reach(home.key(&sign_in)).unwrap().base;

    assert_eq!(reached, REMOTE);
}

#[test]
fn asks_who_answers_at_an_address_before_any_token_goes_there() {
    let (home, sign_in) = Household::signed_in();
    lost(&home, &sign_in);

    home.plex.reach(home.key(&sign_in)).unwrap();

    let probe = &home.web.asked(&format!("{LOCAL}/identity"))[0];
    assert_eq!(probe.value("X-Plex-Token"), None);
}

#[test]
fn says_the_server_did_not_answer_when_no_address_does() {
    let (home, sign_in) = Household::signed_in();
    lost(&home, &sign_in);
    home.web.is_silent(get(&format!("{LOCAL}/identity")));

    let reached = home.plex.reach(home.key(&sign_in));

    let error = reached.err().unwrap();
    assert_eq!(
        error.downcast_ref::<Failure>(),
        Some(&Failure::Unreached(SERVER))
    );
}

#[test]
fn a_server_plex_no_longer_lists_is_an_error() {
    let (home, sign_in) = Household::signed_in();
    lost(&home, &sign_in);
    home.web.answers(
        get(&format!("{ACCOUNT}/api/v2/resources")).with("X-Plex-Token", &home.account_token),
        200,
        "<resources/>",
    );

    let reached = home.plex.reach(home.key(&sign_in));

    assert!(reached.is_err());
}

#[test]
fn a_server_no_sign_in_reaches_is_an_error() {
    let (home, sign_in) = Household::signed_in();
    let elsewhere = crate::store::ServerKey {
        sign_in: &sign_in,
        server: "friend-machine",
    };

    let reached = home.plex.reach(elsewhere);

    assert!(reached.is_err());
}

#[test]
fn a_server_that_stops_answering_is_looked_for_again_on_the_next_call() {
    let (home, sign_in) = Household::signed_in();

    let done: anyhow::Result<()> = home.plex.on_server(home.key(&sign_in), |_| {
        Err(Failure::Unreached(SERVER).into())
    });

    let kept = crate::store::server(&home.pool, home.key(&sign_in))
        .unwrap()
        .unwrap();
    assert!(done.is_err());
    assert_eq!(kept.route, None);
}

#[test]
fn a_server_that_answers_with_an_error_keeps_its_address() {
    let (home, sign_in) = Household::signed_in();

    let done: anyhow::Result<()> = home.plex.on_server(home.key(&sign_in), |_| {
        Err(Failure::Status(SERVER, 500).into())
    });

    let kept = crate::store::server(&home.pool, home.key(&sign_in))
        .unwrap()
        .unwrap();
    assert!(done.is_err());
    assert_eq!(kept.route.as_deref(), Some(LOCAL));
}
