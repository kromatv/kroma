//! One module's answer as bytes, for a caller that reads no more than it chose
//! and parses the answer itself.

use super::{Answer, Point};

/// What one call may cost the core: how long it may run, and how many bytes of
/// answer the caller will read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Allowance {
    pub seconds: u32,
    pub bytes: usize,
}

/// Why a call handed back nothing to parse: no running module with that id
/// answers the point, the call failed, or the answer is past the allowance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Silence {
    Absent,
    Failed(String),
    TooLarge,
}

impl Point {
    /// What `module` answered `method`, unparsed and within `allowance`. An
    /// answer past `allowance.bytes` is refused whole, never cut.
    pub fn bytes_from<B: serde::Serialize>(
        &self,
        module: &str,
        method: &str,
        body: &B,
        allowance: Allowance,
    ) -> Result<Vec<u8>, Silence> {
        let sent = serde_json::to_value(body).map_err(|e| Silence::Failed(e.to_string()))?;
        let answer = match &self.answer {
            Answer::Live(resolve) => {
                let found = resolve(self.name)
                    .into_iter()
                    .find(|found| found.module_id == module)
                    .ok_or(Silence::Absent)?;
                kroma_http::Loopback::new()
                    .header("authorization", format!("Bearer {}", found.token))
                    .max_time(allowance.seconds)
                    .post_json(
                        &format!("{}/_port/{}/{method}", found.base_url, self.name),
                        &sent,
                    )
                    .and_then(kroma_http::Response::ensure_ok)
                    .map_err(|e| Silence::Failed(format!("{e:#}")))?
                    .body
            }
            Answer::Stub(answering) => {
                let (_, f) = answering
                    .iter()
                    .find(|(id, _)| id == module)
                    .ok_or(Silence::Absent)?;
                let answer = f(method, &sent)
                    .ok_or_else(|| Silence::Failed(format!("no answer to {method}")))?;
                serde_json::to_vec(&answer).map_err(|e| Silence::Failed(e.to_string()))?
            }
            Answer::Absent => return Err(Silence::Absent),
        };
        if answer.len() > allowance.bytes {
            return Err(Silence::TooLarge);
        }
        Ok(answer)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::Router;
    use axum::routing::post;
    use serde_json::json;

    use super::*;

    const SMALL: Allowance = Allowance {
        seconds: 5,
        bytes: 64,
    };

    async fn served(router: Router) -> Point {
        let resolve = kroma_module_host::test_serve::serve(router, ()).await;
        let (base_url, token) = resolve().unwrap();
        Point::new(
            "importer",
            Arc::new(move |_| {
                vec![kroma_module_host::Contribution {
                    module_id: "tv.x.import".into(),
                    instance: None,
                    base_url: base_url.clone(),
                    token: token.clone(),
                }]
            }),
        )
    }

    fn ask(point: Point, module: &'static str) -> Result<Vec<u8>, Silence> {
        point.bytes_from(module, "survey", &json!({ "server": "s" }), SMALL)
    }

    #[tokio::test]
    async fn a_running_module_answers_over_the_wire_with_the_bytes_it_sent() {
        let point = served(
            Router::new().route("/_port/importer/survey", post(|| async { r#"{"Ok":{}}"# })),
        )
        .await;

        let answer =
            kroma_module_host::test_serve::blocking(move || ask(point, "tv.x.import")).await;

        assert_eq!(answer, Ok(br#"{"Ok":{}}"#.to_vec()));
    }

    #[tokio::test]
    async fn an_answer_past_the_allowance_is_refused_before_anything_reads_it() {
        let point = served(Router::new().route(
            "/_port/importer/survey",
            post(|| async { "x".repeat(SMALL.bytes + 1) }),
        ))
        .await;

        let answer =
            kroma_module_host::test_serve::blocking(move || ask(point, "tv.x.import")).await;

        assert_eq!(answer, Err(Silence::TooLarge));
    }

    #[tokio::test]
    async fn a_module_that_answers_an_error_status_has_failed() {
        let point = served(Router::new()).await;

        let answer =
            kroma_module_host::test_serve::blocking(move || ask(point, "tv.x.import")).await;

        assert!(matches!(answer, Err(Silence::Failed(_))));
    }

    #[tokio::test]
    async fn a_module_that_is_not_the_one_asked_is_absent() {
        let point = served(Router::new()).await;

        let answer =
            kroma_module_host::test_serve::blocking(move || ask(point, "tv.x.other")).await;

        assert_eq!(answer, Err(Silence::Absent));
    }

    #[test]
    fn a_point_nothing_answers_is_absent() {
        let answer = ask(Point::absent("importer"), "tv.x.import");

        assert_eq!(answer, Err(Silence::Absent));
    }

    #[test]
    fn a_stub_is_held_to_the_same_allowance() {
        let small = Point::stub("importer", |_, _| Some(json!({ "Ok": {} })));
        let large = Point::stub("importer", |_, _| Some(json!("x".repeat(SMALL.bytes))));

        assert_eq!(ask(small, "importer"), Ok(br#"{"Ok":{}}"#.to_vec()));
        assert_eq!(ask(large, "importer"), Err(Silence::TooLarge));
    }

    #[test]
    fn a_stub_that_does_not_know_the_method_has_failed() {
        let point = Point::stub("importer", |_, _| None);

        assert!(matches!(ask(point, "importer"), Err(Silence::Failed(_))));
    }
}
