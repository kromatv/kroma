//! The api actions a module may put on a notification button. A press sends
//! the request with the reader's own session, so a button reaches a request
//! review or the module's own routes, never the rest of the API.

use kroma_module_host::{ActionKind, ActionSpec};

const REVIEW_PREFIX: &str = "/api/requests/";
const REVIEW_VERBS: [&str; 2] = ["approve", "deny"];
const MODULE_PREFIX: &str = "/api/module/";

/// The first api action in `actions` that `module` may not send: one whose
/// method is not POST, or whose href is neither a request review
/// (`/api/requests/<id>/approve|deny`) nor a route under the module's own
/// `/api/module/<its id>/`. A caller no token names has no routes of its own.
pub(super) fn refused_action<'a>(
    module: Option<&str>,
    actions: &'a [ActionSpec],
) -> Option<&'a ActionSpec> {
    actions
        .iter()
        .filter(|action| action.kind == ActionKind::Api)
        .find(|action| !admits(module, action))
}

fn admits(module: Option<&str>, action: &ActionSpec) -> bool {
    let posts = action
        .method
        .as_deref()
        .is_none_or(|method| method.eq_ignore_ascii_case("POST"));
    let route = is_review(&action.href) || module.is_some_and(|id| is_own(id, &action.href));
    posts && route
}

fn is_review(href: &str) -> bool {
    href.strip_prefix(REVIEW_PREFIX)
        .and_then(|rest| rest.split_once('/'))
        .is_some_and(|(id, verb)| is_id(id) && REVIEW_VERBS.contains(&verb))
}

fn is_own(module: &str, href: &str) -> bool {
    href.strip_prefix(MODULE_PREFIX)
        .and_then(|rest| rest.strip_prefix(module))
        .and_then(|rest| rest.strip_prefix('/'))
        .is_some_and(|path| path.split('/').all(is_plain_segment))
}

fn is_id(segment: &str) -> bool {
    !segment.is_empty()
        && segment
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
}

fn is_plain_segment(segment: &str) -> bool {
    segment.bytes().any(|b| b != b'.')
        && segment
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~'))
}

#[cfg(test)]
mod tests;
