use super::*;

use crate::test_support::{mint, store};

fn pending_row(id: &str, expires_at: i64) -> Pending {
    Pending {
        id: id.to_string(),
        pin_id: 42,
        code: mint("code"),
        expires_at,
        sign_in: None,
    }
}

fn server_row(id: &str) -> ServerRow {
    ServerRow {
        id: id.to_string(),
        name: format!("Server {id}"),
        token: mint("server"),
        address: None,
        route: None,
    }
}

fn signed_in(pool: &Pool, id: &str, servers: &[ServerRow]) -> SignIn {
    let sign_in = SignIn {
        id: id.to_string(),
        token: mint("account"),
        account_id: "7001".to_string(),
    };
    open_pending(pool, &pending_row(&format!("p-{id}"), 900)).unwrap();
    keep_sign_in(
        pool,
        &Finished {
            pending: &format!("p-{id}"),
            sign_in: &sign_in,
            servers,
            now: 100,
        },
    )
    .unwrap();
    sign_in
}

fn rows(pool: &Pool, table: &str) -> i64 {
    pool.get()
        .unwrap()
        .query_row(&format!("SELECT count(*) FROM {table}"), (), |row| {
            row.get(0)
        })
        .unwrap()
}

#[test]
fn keeps_one_client_identifier_for_the_install() {
    let pool = store();

    let first = client_id(&pool).unwrap();
    let second = client_id(&pool).unwrap();

    assert_eq!(first, second);
    assert_eq!(first.len(), 64);
}

#[test]
fn finds_a_pending_sign_in_until_it_is_swept() {
    let pool = store();
    open_pending(&pool, &pending_row("p-1", 900)).unwrap();

    let before = pending(&pool, "p-1").unwrap();
    sweep_pending(&pool, 899).unwrap();
    let still = pending(&pool, "p-1").unwrap();
    sweep_pending(&pool, 900).unwrap();
    let after = pending(&pool, "p-1").unwrap();

    assert_eq!(before.map(|row| row.pin_id), Some(42));
    assert!(still.is_some());
    assert!(after.is_none());
}

#[test]
fn a_finished_sign_in_names_its_servers_and_where_it_came_from() {
    let pool = store();

    let kept = signed_in(&pool, "s-1", &[server_row("b"), server_row("a")]);

    let found = sign_in(&pool, "s-1").unwrap().unwrap();
    let names: Vec<String> = servers(&pool, "s-1")
        .unwrap()
        .into_iter()
        .map(|row| row.id)
        .collect();
    assert_eq!(found.token, kept.token);
    assert_eq!(found.account_id, "7001");
    assert_eq!(names, ["a", "b"]);
    assert_eq!(
        pending(&pool, "p-s-1").unwrap().unwrap().sign_in.as_deref(),
        Some("s-1")
    );
}

#[test]
fn keeps_the_address_that_answered_as_a_server_until_it_is_cleared() {
    let pool = store();
    signed_in(&pool, "s-1", &[server_row("a")]);
    let key = ServerKey {
        sign_in: "s-1",
        server: "a",
    };

    set_route(&pool, key, Some("https://lan.example:32400")).unwrap();
    let routed = server(&pool, key).unwrap().unwrap().route;
    set_route(&pool, key, None).unwrap();
    let cleared = server(&pool, key).unwrap().unwrap().route;

    assert_eq!(routed.as_deref(), Some("https://lan.example:32400"));
    assert_eq!(cleared, None);
}

#[test]
fn replaces_the_readers_of_a_server_whole() {
    let pool = store();
    let key = ServerKey {
        sign_in: "s-1",
        server: "a",
    };
    let (old, new) = (mint("reader"), mint("reader"));
    keep_readers(
        &pool,
        key,
        &[("7002".into(), old), ("7003".into(), mint("reader"))],
    )
    .unwrap();

    keep_readers(&pool, key, &[("7002".into(), new.clone())]).unwrap();

    assert_eq!(reader_token(&pool, key, "7002").unwrap(), Some(new));
    assert_eq!(reader_token(&pool, key, "7003").unwrap(), None);
}

#[test]
fn forgetting_a_sign_in_leaves_nothing_of_it_and_keeps_another() {
    let pool = store();
    signed_in(&pool, "s-1", &[server_row("a")]);
    signed_in(&pool, "s-2", &[server_row("a")]);
    for sign_in in ["s-1", "s-2"] {
        let key = ServerKey {
            sign_in,
            server: "a",
        };
        keep_readers(&pool, key, &[("7002".into(), mint("reader"))]).unwrap();
    }

    forget(&pool, "s-1").unwrap();

    assert!(sign_in(&pool, "s-1").unwrap().is_none());
    assert!(sign_in(&pool, "s-2").unwrap().is_some());
    assert_eq!(
        ["sign_ins", "servers", "readers", "pending"].map(|table| rows(&pool, table)),
        [1, 1, 1, 1]
    );
}

#[test]
fn forgetting_a_sign_in_that_is_not_held_is_not_an_error() {
    let pool = store();

    let forgotten = forget(&pool, "never-kept");

    assert!(forgotten.is_ok());
}
