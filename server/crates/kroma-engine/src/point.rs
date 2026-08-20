//! A point the core calls: a NAME, and JSON in both directions.
//!
//! The engine holds no type describing what a point is for. There is no trait a
//! module implements and nothing here that could only be answered by one
//! implementation: a module answers `POST /_port/<point>/<method>` with the
//! fields it chooses, and this reads the ones the caller asked for. That is why
//! a feature nobody here has thought of needs no edit in this crate.
//!
//! Nothing answering is not an error. `call` returns `None`, and the core's own
//! features degrade — no recommendations rather than a failed request.

use std::sync::Arc;

use serde_json::Value;

use crate::state::Contributions;

/// One point the core calls, resolved per call so a module installed or
/// restarted later is picked up with nothing re-wired.
#[derive(Clone)]
pub struct Point {
    name: &'static str,
    answer: Answer,
}

/// A test's answer to any method, as `(method, body) -> answer`.
type StubFn = Arc<dyn Fn(&str, &Value) -> Option<Value> + Send + Sync>;

#[derive(Clone)]
enum Answer {
    /// The live server: whoever contributes the point right now.
    Live(Contributions),
    /// Answered in this process, for a test with no sidecar to serve. Generic on
    /// purpose, so a test fakes any point without a type here naming what it does.
    Stub(StubFn),
    /// Nothing answers, which is the state of every point on a fresh install.
    Absent,
}

impl Point {
    pub fn new(name: &'static str, resolve: Contributions) -> Self {
        Self { name, answer: Answer::Live(resolve) }
    }

    /// A point answered by `f` in this process. For a test that needs the core's
    /// side of a feature without standing a sidecar up.
    pub fn stub(
        name: &'static str,
        f: impl Fn(&str, &Value) -> Option<Value> + Send + Sync + 'static,
    ) -> Self {
        Self { name, answer: Answer::Stub(Arc::new(f)) }
    }

    /// A point nothing answers.
    pub fn absent(name: &'static str) -> Self {
        Self { name, answer: Answer::Absent }
    }

    /// Whether anything answers it right now.
    pub fn live(&self) -> bool {
        match &self.answer {
            Answer::Live(resolve) => !resolve(self.name).is_empty(),
            Answer::Stub(_) => true,
            Answer::Absent => false,
        }
    }

    /// Call `method` with `body`. `None` when nothing answers, the call fails, or
    /// the answer is not the shape the caller asked for: a point is another
    /// process on another release, so every one of those is the same "no answer"
    /// to the feature calling it.
    pub fn call<B: serde::Serialize, T: serde::de::DeserializeOwned>(
        &self,
        method: &str,
        body: &B,
    ) -> Option<T> {
        match &self.answer {
            Answer::Live(resolve) => {
                let found = resolve(self.name).into_iter().next()?;
                let endpoint = (found.base_url, found.token);
                let resolver: kroma_module_host::Resolver =
                    Arc::new(move || Some(endpoint.clone()));
                kroma_module_host::call_raw(
                    &resolver,
                    &format!("{}/{method}", self.name),
                    body,
                )
                .ok()
            }
            Answer::Stub(f) => {
                let sent = serde_json::to_value(body).ok()?;
                serde_json::from_value(f(method, &sent)?).ok()
            }
            Answer::Absent => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use serde_json::json;

    #[test]
    fn a_point_nothing_answers_is_none_rather_than_a_failure() {
        let p = Point::absent("embedder");

        assert!(!p.live());
        assert_eq!(p.call::<_, Vec<f32>>("embed", &json!({ "text": "x" })), None);
    }

    #[test]
    fn a_live_point_with_no_contribution_answers_none() {
        let p = Point::new("embedder", Arc::new(|_| Vec::new()));

        assert!(!p.live());
        assert_eq!(p.call::<_, Vec<f32>>("embed", &json!({})), None);
    }

    #[test]
    fn a_contribution_that_cannot_be_reached_answers_none() {
        // Port 1 on loopback refuses immediately, standing in for a module that
        // is registered but not serving.
        let p = Point::new(
            "embedder",
            Arc::new(|_| {
                vec![kroma_module_host::Contribution {
                    module_id: "tv.x.vector".into(),
                    instance: None,
                    base_url: "http://127.0.0.1:1".into(),
                    token: "t".into(),
                }]
            }),
        );

        assert!(p.live());
        assert_eq!(p.call::<_, Vec<f32>>("embed", &json!({})), None);
    }

    #[test]
    fn a_stub_sees_the_method_and_the_body_it_was_sent() {
        let p = Point::stub("embedder", |method, body| {
            assert_eq!(method, "embed");
            assert_eq!(body["text"], "hello");
            Some(json!([0.5, 0.5]))
        });

        assert!(p.live());
        assert_eq!(p.call::<_, Vec<f32>>("embed", &json!({ "text": "hello" })), Some(vec![0.5, 0.5]));
    }

    #[test]
    fn an_answer_of_another_shape_reads_as_no_answer() {
        // The two ends ship on separate releases; a payload this build cannot
        // read is the same thing to the feature as nothing answering.
        let p = Point::stub("embedder", |_, _| Some(json!({ "unexpected": true })));

        assert_eq!(p.call::<_, Vec<f32>>("embed", &json!({})), None);
    }
}
