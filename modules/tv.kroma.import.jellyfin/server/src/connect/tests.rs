use serde_json::json;

use super::*;

use crate::dialect::{Method, JELLYFIN};
use crate::test_support::{fixture, form, Recorded, World, ADDRESS, SERVER};

fn refusal(answer: Connected) -> (Refusal, Option<String>) {
    match answer {
        Connected::Refused { reason, message } => (reason, message),
        Connected::Ready { .. } => panic!("the sign-in was not refused"),
    }
}

fn device_ids(world: &World) -> Vec<String> {
    world.jellyfin.seen(|seen| {
        seen.iter()
            .filter(|call| call.path == JELLYFIN.sign_in.path)
            .filter_map(|call| call.authorization.clone())
            .filter_map(|header| {
                let (_, rest) = header.split_once("DeviceId=\"")?;
                rest.split_once('"').map(|(id, _)| id.to_string())
            })
            .collect()
    })
}

#[test]
fn an_administrator_signs_in_and_the_answer_names_the_server_reached() {
    let world = World::over(Recorded::jellyfin());

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    let Connected::Ready { sign_in, servers } = answer else {
        panic!("the sign-in was refused");
    };
    assert_eq!(sign_in.len(), 64);
    assert_eq!(
        servers,
        vec![Server {
            id: SERVER.to_string(),
            name: "Living room".to_string(),
            address: ADDRESS.to_string(),
        }]
    );
}

#[test]
fn the_sign_in_names_the_caller_under_the_media_browser_scheme_with_no_token() {
    let world = World::over(Recorded::jellyfin());

    world.signed_in();

    let (method, header, body) = world.jellyfin.seen(|seen| {
        let call = &seen[1];
        (
            call.method,
            call.authorization.clone().unwrap(),
            call.body.clone().unwrap(),
        )
    });
    assert_eq!(method, Method::Post);
    assert!(header.starts_with("MediaBrowser Client=\"KROMA\", Device=\"KROMA\", DeviceId=\""));
    assert!(!header.contains("Token="));
    assert_eq!(
        body,
        json!({ "Username": "sam", "Pw": world.jellyfin.password() })
    );
}

#[test]
fn the_server_is_asked_who_it_is_before_any_password_is_sent() {
    let world = World::over(Recorded::jellyfin());

    world.signed_in();

    let (first, sent_to_it) = world.jellyfin.seen(|seen| {
        (
            seen[0].path.clone(),
            (seen[0].authorization.clone(), seen[0].body.clone()),
        )
    });
    assert_eq!(first, "/System/Info/Public");
    assert_eq!(sent_to_it, (None, None));
}

#[test]
fn no_address_finds_a_jellyfin_on_this_machine_at_its_default_port() {
    let world = World::over(Recorded::jellyfin().at("http://127.0.0.1:8096"));

    let answer = world.importer.connect(&world.form("", "sam")).unwrap();

    let Connected::Ready { servers, .. } = answer else {
        panic!("the sign-in was refused");
    };
    assert_eq!(servers[0].address, "http://127.0.0.1:8096");
}

#[test]
fn an_address_typed_without_http_and_with_a_last_slash_is_still_found() {
    let world = World::over(Recorded::jellyfin());

    let answer = world
        .importer
        .connect(&world.form(" jellyfin.test:8096/ ", "sam"))
        .unwrap();

    assert!(matches!(answer, Connected::Ready { .. }));
}

#[test]
fn an_address_with_its_scheme_in_capitals_is_still_found() {
    let world = World::over(Recorded::jellyfin());

    let answer = world
        .importer
        .connect(&world.form("HTTP://jellyfin.test:8096", "sam"))
        .unwrap();

    let Connected::Ready { servers, .. } = answer else {
        panic!("the sign-in was refused");
    };
    assert_eq!(servers[0].address, "http://jellyfin.test:8096");
}

#[test]
fn a_wrong_password_is_refused_as_credentials() {
    let world = World::over(Recorded::jellyfin());
    let mistyped = form(ADDRESS, "sam", &format!("{}x", world.jellyfin.password()));

    let answer = world.importer.connect(&mistyped).unwrap();

    assert_eq!(refusal(answer), (Refusal::Credentials, None));
}

#[test]
fn a_form_with_no_username_is_refused_before_any_call() {
    let world = World::over(Recorded::jellyfin());

    let answer = world.importer.connect(&world.form(ADDRESS, "  ")).unwrap();

    assert_eq!(refusal(answer), (Refusal::Credentials, None));
    assert!(world.jellyfin.paths().is_empty());
}

#[test]
fn a_user_who_is_no_administrator_is_refused_and_nothing_is_kept() {
    let mut granted = fixture(include_str!("../fixtures/authenticated.json"));
    granted["User"]["Policy"]["IsAdministrator"] = json!(false);
    let jellyfin = Recorded::jellyfin();
    granted["AccessToken"] = json!(jellyfin.token());
    let world = World::over(jellyfin.on(JELLYFIN.sign_in.path, &[], granted));

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    let kept: i64 = world
        .importer
        .store
        .get()
        .unwrap()
        .query_row("SELECT count(*) FROM sign_ins", (), |row| row.get(0))
        .unwrap();
    assert_eq!(refusal(answer), (Refusal::NotAdministrator, None));
    assert_eq!(kept, 0);
}

#[test]
fn an_address_where_nothing_answers_is_refused_as_unreachable() {
    let world = World::over(Recorded::jellyfin());

    let answer = world
        .importer
        .connect(&world.form("http://nothing.test:8096", "sam"))
        .unwrap();

    assert_eq!(refusal(answer), (Refusal::Unreachable, None));
}

#[test]
fn an_address_that_is_not_a_web_address_is_refused_as_unreachable() {
    let world = World::over(Recorded::jellyfin());

    let answers: Vec<Refusal> = ["ftp://jellyfin.test", "http://", "jelly fin.test"]
        .into_iter()
        .map(|typed| refusal(world.importer.connect(&world.form(typed, "sam")).unwrap()).0)
        .collect();

    assert_eq!(answers, vec![Refusal::Unreachable; 3]);
    assert!(world.jellyfin.paths().is_empty());
}

#[test]
fn a_server_that_is_not_a_jellyfin_is_refused_as_unsupported_and_named() {
    let emby = json!({ "ServerName": "Den", "Version": "4.8.11.0", "ProductName": "Emby Server", "Id": "x1" });
    let world = World::over(Recorded::jellyfin().on(JELLYFIN.server.path, &[], emby));

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    assert_eq!(
        refusal(answer),
        (
            Refusal::Unsupported,
            Some("Emby Server 4.8.11.0".to_string())
        )
    );
    assert_eq!(world.jellyfin.paths(), vec!["/System/Info/Public"]);
}

#[test]
fn an_answer_that_is_not_a_server_s_is_refused_as_unsupported() {
    let page = (404, json!(null));
    let world = World::over(Recorded::jellyfin().answering(JELLYFIN.server.path, &[], page));

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    assert_eq!(refusal(answer), (Refusal::Unsupported, None));
}

#[test]
fn a_gateway_with_nothing_behind_it_is_refused_as_unreachable() {
    let down = (502, json!(null));
    let world = World::over(Recorded::jellyfin().answering(JELLYFIN.server.path, &[], down));

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    assert_eq!(refusal(answer), (Refusal::Unreachable, None));
}

#[test]
fn a_redirect_is_not_followed_and_the_refusal_says_where_it_points() {
    let moved = (
        301,
        json!({ "Location": "https://jellyfin.test/System/Info/Public" }),
    );
    let world = World::over(Recorded::jellyfin().answering(JELLYFIN.server.path, &[], moved));

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    assert_eq!(
        refusal(answer),
        (
            Refusal::Unreachable,
            Some("https://jellyfin.test/System/Info/Public".to_string())
        )
    );
    assert_eq!(world.jellyfin.paths(), vec!["/System/Info/Public"]);
}

#[test]
fn a_sign_in_the_server_forbids_is_refused_as_other() {
    let forbidden = (403, json!(null));
    let world = World::over(Recorded::jellyfin().answering(JELLYFIN.sign_in.path, &[], forbidden));

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    assert_eq!(refusal(answer), (Refusal::Other, None));
}

#[test]
fn a_sign_in_that_gives_no_token_is_refused_as_unsupported() {
    let empty = json!({ "User": { "Id": "u1", "Policy": { "IsAdministrator": true } } });
    let world = World::over(Recorded::jellyfin().on(JELLYFIN.sign_in.path, &[], empty));

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    assert_eq!(refusal(answer), (Refusal::Unsupported, None));
}

#[test]
fn a_sign_in_in_progress_is_unknown_here_and_asks_the_server_nothing() {
    let world = World::over(Recorded::jellyfin());
    let ask = ConnectAsk {
        pending: Some("p-7".to_string()),
        ..ConnectAsk::default()
    };

    let answer = world.importer.connect(&ask).unwrap();

    assert_eq!(refusal(answer), (Refusal::Expired, None));
    assert!(world.jellyfin.paths().is_empty());
}

#[test]
fn the_token_is_kept_and_the_password_is_not() {
    let world = World::over(Recorded::jellyfin());

    let sign_in = world.signed_in();

    let kept = sign_ins::find(&world.importer.store, &sign_in)
        .unwrap()
        .unwrap();
    let held = [
        &kept.id,
        &kept.address,
        &kept.server,
        &kept.user,
        &kept.token,
        &kept.device,
    ];
    assert_eq!(kept.token, world.jellyfin.token());
    assert!(held
        .iter()
        .all(|value| !value.contains(world.jellyfin.password())));
}

#[test]
fn signing_in_again_replaces_the_sign_in_kept_before() {
    let world = World::over(Recorded::jellyfin());

    let first = world.signed_in();
    let second = world.signed_in();

    assert_ne!(first, second);
    assert!(sign_ins::find(&world.importer.store, &first)
        .unwrap()
        .is_none());
    assert!(sign_ins::find(&world.importer.store, &second)
        .unwrap()
        .is_some());
}

#[test]
fn one_installation_names_itself_the_same_way_for_one_account_each_time() {
    let world = World::over(Recorded::jellyfin());

    world.signed_in();
    world.signed_in();
    let _ = world.importer.connect(&world.form(ADDRESS, "SAM"));
    let _ = world.importer.connect(&world.form(ADDRESS, "ana"));

    let ids = device_ids(&world);
    assert_eq!(ids[0], ids[1]);
    assert_eq!(ids[0], ids[2]);
    assert_ne!(ids[0], ids[3]);
}
