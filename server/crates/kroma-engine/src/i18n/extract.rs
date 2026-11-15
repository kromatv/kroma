//! The locales a request is answered in, read from its `Accept-Language`.

use std::convert::Infallible;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use crate::state::SharedState;

use super::{content_locale, detect_locale};

fn accept_language(parts: &Parts) -> Option<&str> {
    parts
        .headers
        .get(axum::http::header::ACCEPT_LANGUAGE)
        .and_then(|v| v.to_str().ok())
}

/// The resolved request locale, from `Accept-Language` (else
/// [`super::DEFAULT_LOCALE`]).
pub struct ReqLocale(pub &'static str);

impl FromRequestParts<SharedState> for ReqLocale {
    type Rejection = Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        Ok(ReqLocale(detect_locale(None, accept_language(parts))))
    }
}

/// The locale the request's stored content is read in: [`ReqLocale`]'s own
/// where it keeps content, else the language it belongs to (`fr-CH` reads
/// `fr`). Never the locale of an interface string, which is [`ReqLocale`].
pub struct ContentLocale(pub &'static str);

impl FromRequestParts<SharedState> for ContentLocale {
    type Rejection = Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let reader = detect_locale(None, accept_language(parts));
        Ok(ContentLocale(content_locale(reader)))
    }
}

/// The locale the request actually asked for, `None` when it sent no
/// `Accept-Language`. Separate from [`ReqLocale`], which answers "what do we
/// serve" and so has to name a locale even when nothing was said.
pub struct AskedLocale(pub Option<&'static str>);

impl FromRequestParts<SharedState> for AskedLocale {
    type Rejection = Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let asked = accept_language(parts).map(|header| detect_locale(None, Some(header)));
        Ok(AskedLocale(asked))
    }
}
