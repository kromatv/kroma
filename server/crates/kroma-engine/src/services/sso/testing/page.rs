//! The provider's sign-in page, for a developer's browser: it asks which
//! made-up person to be, since there is no password to check.

use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Query, State};
use axum::response::{Html, IntoResponse, Redirect, Response};
use serde_json::json;

use super::provider::Shared;

struct Persona {
    id: &'static str,
    name: &'static str,
    email: &'static str,
    groups: &'static [&'static str],
}

const PEOPLE: [Persona; 3] = [
    Persona {
        id: "lea",
        name: "Léa Martin",
        email: "lea@home.test",
        groups: &["family"],
    },
    Persona {
        id: "noah",
        name: "Noah Martin",
        email: "noah@home.test",
        groups: &["family", "kids"],
    },
    Persona {
        id: "sam",
        name: "Sam Visitor",
        email: "sam@elsewhere.test",
        groups: &[],
    },
];

fn href(asked: &HashMap<String, String>, extra: (&str, &str)) -> String {
    let query = form_urlencoded::Serializer::new(String::new())
        .extend_pairs(asked.iter().filter(|(key, _)| *key != "as" && *key != "deny"))
        .append_pair(extra.0, extra.1)
        .finish();
    format!("/authorize?{query}")
}

fn page(asked: &HashMap<String, String>) -> String {
    let people: String = PEOPLE
        .iter()
        .map(|person| {
            format!(
                "<a class=\"who\" href=\"{}\"><b>{}</b><span>{} · {}</span></a>",
                href(asked, ("as", person.id)),
                person.name,
                person.email,
                if person.groups.is_empty() {
                    "no group".to_string()
                } else {
                    person.groups.join(", ")
                },
            )
        })
        .collect();
    format!(
        "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" \
         content=\"width=device-width,initial-scale=1\"><title>Dev provider</title>\
         <style>body{{font:16px system-ui;background:#101418;color:#e8ecf0;display:grid;\
         place-items:center;min-height:100vh;margin:0}}main{{width:min(360px,90vw)}}\
         h1{{font-size:20px}}p{{color:#9aa4ae}}.who{{display:block;padding:14px 16px;\
         margin:10px 0;border:1px solid #2a323a;border-radius:12px;color:inherit;\
         text-decoration:none}}.who:hover{{border-color:#5b8cff}}.who span{{display:block;\
         color:#9aa4ae;font-size:13px;margin-top:2px}}.no{{color:#9aa4ae;font-size:14px}}\
         </style><main><h1>Dev provider</h1><p>Sign in to KROMA as</p>{people}\
         <a class=\"no\" href=\"{}\">Cancel</a></main>",
        href(asked, ("deny", "1")),
    )
}

/// `GET /authorize`: the page, or the redirect back once a person was picked.
pub(super) async fn authorize(
    State(shared): State<Arc<Shared>>,
    Query(asked): Query<HashMap<String, String>>,
) -> Response {
    let back = |name: &str| asked.get(name).cloned().unwrap_or_default();
    if asked.contains_key("deny") {
        let denied = format!(
            "{}?error=access_denied&state={}",
            back("redirect_uri"),
            back("state")
        );
        return Redirect::to(&denied).into_response();
    }
    let picked = asked
        .get("as")
        .and_then(|id| PEOPLE.iter().find(|person| person.id == id));
    match picked {
        Some(person) => {
            let claims = json!({
                "sub": format!("dev-{}", person.id),
                "preferred_username": person.id,
                "email": person.email,
                "name": person.name,
                "groups": person.groups,
            });
            Redirect::to(&shared.grant(&asked, claims)).into_response()
        }
        None => Html(page(&asked)).into_response(),
    }
}
