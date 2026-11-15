//! A point the core calls: a NAME, and JSON in both directions.
//!
//! Nothing answering is not an error. `call` returns `None`, and the core's own
//! features degrade: no recommendations rather than a failed request.

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

/// One module's answers in a [`Point::stubs`]: the method and the body in, the
/// answer out, `None` for no answer.
pub type StubFn = Arc<dyn Fn(&str, &Value) -> Option<Value> + Send + Sync>;

#[derive(Clone)]
enum Answer {
    Live(Contributions),
    Stub(Vec<(String, StubFn)>),
    Absent,
}

impl Point {
    pub fn new(name: &'static str, resolve: Contributions) -> Self {
        Self {
            name,
            answer: Answer::Live(resolve),
        }
    }

    /// A point answered by `f` in this process.
    pub fn stub(
        name: &'static str,
        f: impl Fn(&str, &Value) -> Option<Value> + Send + Sync + 'static,
    ) -> Self {
        Self {
            name,
            answer: Answer::Stub(vec![(name.to_string(), Arc::new(f))]),
        }
    }

    /// A point answered in this process by several modules, each by its id, in
    /// the order given.
    pub fn stubs(name: &'static str, answering: Vec<(&str, StubFn)>) -> Self {
        Self {
            name,
            answer: Answer::Stub(
                answering
                    .into_iter()
                    .map(|(module, f)| (module.to_string(), f))
                    .collect(),
            ),
        }
    }

    pub fn absent(name: &'static str) -> Self {
        Self {
            name,
            answer: Answer::Absent,
        }
    }

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
                kroma_module_host::call_raw(
                    &found.resolver(),
                    &format!("{}/{method}", self.name),
                    body,
                )
                .ok()
            }
            Answer::Stub(answering) => {
                let (_, f) = answering.first()?;
                let sent = serde_json::to_value(body).ok()?;
                serde_json::from_value(f(method, &sent)?).ok()
            }
            Answer::Absent => None,
        }
    }

    /// The id of every module answering this point right now.
    pub fn answering(&self) -> Vec<String> {
        match &self.answer {
            Answer::Live(resolve) => resolve(self.name)
                .into_iter()
                .map(|found| found.module_id)
                .collect(),
            Answer::Stub(answering) => answering.iter().map(|(module, _)| module.clone()).collect(),
            Answer::Absent => Vec::new(),
        }
    }

    /// [`Self::call`], to the one module `module` among those answering.
    pub fn call_module<B: serde::Serialize, T: serde::de::DeserializeOwned>(
        &self,
        module: &str,
        method: &str,
        body: &B,
    ) -> Option<T> {
        match &self.answer {
            Answer::Live(resolve) => {
                let found = resolve(self.name)
                    .into_iter()
                    .find(|found| found.module_id == module)?;
                kroma_module_host::call_raw(
                    &found.resolver(),
                    &format!("{}/{method}", self.name),
                    body,
                )
                .ok()
            }
            Answer::Stub(answering) => {
                let (_, f) = answering.iter().find(|(id, _)| id == module)?;
                let sent = serde_json::to_value(body).ok()?;
                serde_json::from_value(f(method, &sent)?).ok()
            }
            Answer::Absent => None,
        }
    }
}

impl Point {
    /// Ask everything answering this point, each by its module id. `None` for one
    /// that could not be reached or answered the wrong shape.
    pub fn answers<B: serde::Serialize, T: serde::de::DeserializeOwned>(
        &self,
        method: &str,
        body: &B,
    ) -> Vec<(String, Option<T>)> {
        match &self.answer {
            Answer::Live(resolve) => resolve(self.name)
                .into_iter()
                .map(|found| {
                    let answer = kroma_module_host::call_raw(
                        &found.resolver(),
                        &format!("{}/{method}", self.name),
                        body,
                    )
                    .ok();
                    (found.module_id, answer)
                })
                .collect(),
            Answer::Stub(answering) => {
                let sent = serde_json::to_value(body).ok();
                answering
                    .iter()
                    .map(|(module, f)| {
                        let answer = sent
                            .as_ref()
                            .and_then(|sent| f(method, sent))
                            .and_then(|value| serde_json::from_value(value).ok());
                        (module.clone(), answer)
                    })
                    .collect()
            }
            Answer::Absent => Vec::new(),
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
        assert_eq!(
            p.call::<_, Vec<f32>>("embed", &json!({ "text": "x" })),
            None
        );
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
        assert_eq!(
            p.call::<_, Vec<f32>>("embed", &json!({ "text": "hello" })),
            Some(vec![0.5, 0.5])
        );
    }

    #[test]
    fn an_answer_of_another_shape_reads_as_no_answer() {
        let p = Point::stub("embedder", |_, _| Some(json!({ "unexpected": true })));

        assert_eq!(p.call::<_, Vec<f32>>("embed", &json!({})), None);
    }
}
