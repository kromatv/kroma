//! Forwarding a core route to whichever module answers a point.
//!
//! Some core routes exist for a feature that lives in a module: the URL is
//! stable and the client knows it, but the work happens in a sidecar. What the
//! core holds for one of those is a point NAME and opaque JSON in both
//! directions. It holds no type describing what the point is for, no trait, and
//! no dependency on the module that answers, which is what lets a module type
//! nobody here has thought of stand behind a route like this.
//!
//! Resolving IS the gate. With no module installed, enabled and running to
//! answer, the route is a localized 404 rather than a broken 500.

use axum::http::StatusCode;
use axum::response::Response;

use kroma_module_host::{pinned_resolver, Resolver};

use crate::api::error::lerr;
use crate::model::User;
use crate::state::SharedState;

/// A resolver for whichever module answers `point`, or a 404 in `user`'s locale
/// when nothing does.
pub fn require(state: &SharedState, user: &User, point: &str) -> Result<Resolver, Response> {
    pinned_resolver(state.as_ref(), point, None).ok_or_else(|| {
        let locale = user
            .language
            .as_deref()
            .and_then(crate::i18n::normalize)
            .unwrap_or(crate::i18n::DEFAULT_LOCALE);
        lerr(locale, StatusCode::NOT_FOUND, "error.moduleDisabled")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::api::test_support::test_app;

    fn someone() -> User {
        User {
            id: "u1".into(),
            email: "ana@t.dev".into(),
            username: "ana".into(),
            avatar_url: None,
            language: Some("fr".into()),
            audio_language: None,
            subtitle_language: None,
            permissions: Vec::new(),
            created_at: "now".into(),
            has_pin: false,
        }
    }

    #[test]
    fn a_point_nothing_answers_is_a_404_rather_than_a_broken_route() {
        let app = test_app();

        let refused = require(&app.state, &someone(), "invented-by-nobody");

        let Err(response) = refused else { panic!("a point nothing answers must not resolve") };
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
