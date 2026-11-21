use kroma_module_host::ActionStyle;

use super::*;

const MODULE: &str = "tv.kroma.torrents";

fn button(method: Option<&str>, href: &str) -> ActionSpec {
    ActionSpec {
        id: "approve".into(),
        label_key: "notifications.action.approve".into(),
        kind: ActionKind::Api,
        href: href.into(),
        method: method.map(str::to_string),
        style: ActionStyle::Primary,
    }
}

fn admitted(module: Option<&str>, method: Option<&str>, href: &str) -> bool {
    refused_action(module, &[button(method, href)]).is_none()
}

#[test]
fn a_module_may_post_a_request_review() {
    assert!(admitted(
        Some(MODULE),
        Some("POST"),
        "/api/requests/0123abcd/approve"
    ));
    assert!(admitted(
        Some(MODULE),
        Some("post"),
        "/api/requests/r1/deny"
    ));
}

#[test]
fn a_button_with_no_method_posts() {
    assert!(admitted(None, None, "/api/requests/r1/approve"));
}

#[test]
fn a_module_may_post_to_its_own_routes() {
    assert!(admitted(
        Some(MODULE),
        Some("POST"),
        "/api/module/tv.kroma.torrents/downloads/7/retry"
    ));
}

#[test]
fn a_button_that_does_not_post_is_refused() {
    for method in ["DELETE", "PUT", "PATCH", "GET"] {
        assert!(
            !admitted(Some(MODULE), Some(method), "/api/requests/r1/approve"),
            "{method}"
        );
    }
}

#[test]
fn a_button_outside_the_one_tap_routes_is_refused() {
    for href in [
        "/api/admin/users/u2",
        "/api/admin/server/restart",
        "/api/requests/r1/delete",
        "/api/requests/r1/approve/again",
        "/api/requests//approve",
        "/api/requests/../approve",
        "/api/requests/r1/approve?then=x",
        "/api/module/tv.kroma.vpn/connect",
        "/api/module/tv.kroma.torrents",
        "/api/module/tv.kroma.torrents/",
        "/api/module/tv.kroma.torrentsx/a",
        "/api/module/tv.kroma.torrents/../../admin/users",
        "/api/module/tv.kroma.torrents/a//b",
        "/api/module/tv.kroma.torrents/a%2F..",
    ] {
        assert!(!admitted(Some(MODULE), Some("POST"), href), "{href}");
    }
}

#[test]
fn a_caller_no_token_names_has_no_module_routes() {
    assert!(!admitted(
        None,
        Some("POST"),
        "/api/module/tv.kroma.torrents/a"
    ));
}

#[test]
fn a_link_button_is_not_judged_here() {
    let link = ActionSpec {
        kind: ActionKind::Link,
        ..button(Some("DELETE"), "/admin/users")
    };

    assert!(refused_action(Some(MODULE), &[link]).is_none());
}

#[test]
fn the_refusal_names_the_first_button_that_breaks_the_rule() {
    let actions = [
        button(Some("POST"), "/api/requests/r1/approve"),
        ActionSpec {
            id: "deny".into(),
            ..button(Some("POST"), "/api/admin/users/u2")
        },
    ];

    let refused = refused_action(Some(MODULE), &actions);

    assert_eq!(refused.map(|action| action.id.as_str()), Some("deny"));
}
