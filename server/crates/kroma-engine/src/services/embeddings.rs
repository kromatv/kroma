//! How the core's own search uses the `embedder` point.
//!
//! Free functions over a [`Point`], not a trait: nothing outside this crate
//! implements anything here, and the module answering only ever sees JSON. An
//! absent module answers nothing, which reads as an empty vector and a relevance
//! floor of 1.0 — semantic features find nothing rather than failing.

use serde_json::json;

use crate::point::Point;

/// One document's vector, or empty when nothing answers.
pub fn embed(point: &Point, text: &str) -> Vec<f32> {
    point
        .call("embed", &json!({ "text": text }))
        .unwrap_or_default()
}

/// A whole batch in ONE call, which is what makes a catalog-wide pass possible
/// over IPC: per-item calls would be thousands of round trips.
pub fn embed_batch(point: &Point, texts: &[String]) -> Vec<Vec<f32>> {
    point
        .call("embed_batch", &json!({ "texts": texts }))
        .unwrap_or_default()
}

/// The width of the vectors this module produces, `0` when nothing answers. A
/// stored vector of another width is noise, so this is what the pipeline stamps
/// its signature with.
pub fn dim(point: &Point) -> usize {
    meta(point).map_or(0, |m| m.dim)
}

/// Minimum cosine for a themed-query hit to count as signal. `1.0` when nothing
/// answers: a floor of zero would let every candidate through on a similarity
/// nothing computed, which is worse than recommending none.
pub fn relevance_floor(point: &Point) -> f32 {
    meta(point).map_or(1.0, |m| m.relevance_floor)
}

// Tolerant on purpose: the module ships on its own tag, so a field it stops
// sending has to fall back to the "nothing answers" value rather than break the
// call.
#[derive(serde::Deserialize)]
#[serde(default)]
struct Meta {
    dim: usize,
    relevance_floor: f32,
}

impl Default for Meta {
    fn default() -> Self {
        Self {
            dim: 0,
            relevance_floor: 1.0,
        }
    }
}

fn meta(point: &Point) -> Option<Meta> {
    point.call("meta", &json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    // The state this module exists for: no vector sidecar installed, so nothing
    // resolves and every call has to answer with something harmless.
    fn absent() -> Point {
        Point::absent("embedder")
    }

    #[test]
    fn an_absent_module_embeds_to_nothing() {
        assert!(embed(&absent(), "a title").is_empty());
        assert!(embed_batch(&absent(), &["a".to_string(), "b".to_string()]).is_empty());
    }

    #[test]
    fn an_absent_module_reports_no_dimensions() {
        assert_eq!(dim(&absent()), 0);
    }

    #[test]
    fn an_absent_module_floors_relevance_at_one_so_nothing_is_recommended() {
        assert_eq!(relevance_floor(&absent()), 1.0);
    }

    #[test]
    fn a_live_module_answers_its_own_width_and_floor() {
        let point = Point::stub("embedder", |method, body| match method {
            "meta" => Some(json!({ "dim": 384, "relevance_floor": 0.32 })),
            "embed" => Some(json!(vec![0.1_f32; 3])),
            "embed_batch" => {
                let n = body["texts"].as_array().map_or(0, Vec::len);
                Some(json!(vec![vec![0.1_f32; 3]; n]))
            }
            _ => None,
        });

        assert_eq!(dim(&point), 384);
        assert!((relevance_floor(&point) - 0.32).abs() < 1e-6);
        assert_eq!(embed(&point, "x").len(), 3);
        assert_eq!(embed_batch(&point, &["a".into(), "b".into()]).len(), 2);
    }

    #[test]
    fn a_module_that_stops_sending_a_field_falls_back_rather_than_failing() {
        // Additive evolution both ways: the two ends were built at different
        // times, so a missing field is the absent answer and not an error.
        let point = Point::stub("embedder", |_, _| Some(json!({ "dim": 512 })));

        assert_eq!(dim(&point), 512);
        assert_eq!(relevance_floor(&point), 1.0);
    }
}
