//! The vector sidecar behind the engine's `Embedder` port. An absent module
//! degrades every call to empty vectors, so recommendations no-op rather than
//! break.

// An absent tv.kroma.vector sidecar degrades every call to empty vectors, so
// recommendations no-op rather than break.
pub struct EmbedderClient {
    resolve: kroma_module_host::Resolver,
    meta: std::sync::RwLock<Option<serde_json::Value>>,
}
impl EmbedderClient {
    pub fn new(resolve: kroma_module_host::Resolver) -> Self {
        Self { resolve, meta: std::sync::RwLock::new(None) }
    }
    fn meta(&self) -> serde_json::Value {
        if let Some(v) = self.meta.read().unwrap().clone() {
            return v;
        }
        let Some((base, token)) = (self.resolve)() else {
            return serde_json::Value::Null;
        };
        let v = kroma_http::Fetch::new()
            .header("authorization", format!("Bearer {token}"))
            .get_json::<serde_json::Value>(&format!("{base}/_port/embedder/meta"))
            .unwrap_or(serde_json::Value::Null);
        if !v.is_null() {
            *self.meta.write().unwrap() = Some(v.clone());
        }
        v
    }
}
impl kroma_engine::ports::Embedder for EmbedderClient {
    fn dim(&self) -> usize {
        self.meta().get("dim").and_then(serde_json::Value::as_u64).unwrap_or(0) as usize
    }
    fn embed(&self, text: &str) -> Vec<f32> {
        kroma_module_host::call_raw(&self.resolve, "embedder/embed", &serde_json::json!({ "text": text }))
            .unwrap_or_default()
    }
    fn embed_batch(&self, texts: &[String]) -> Vec<Vec<f32>> {
        kroma_module_host::call_raw(&self.resolve, "embedder/embed_batch", &serde_json::json!({ "texts": texts }))
            .unwrap_or_default()
    }
    fn relevance_floor(&self) -> f32 {
        self.meta().get("relevance_floor").and_then(serde_json::Value::as_f64).map(|f| f as f32).unwrap_or(1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_engine::ports::Embedder;
    use std::sync::Arc;

    // The state this whole type exists for: no vector sidecar installed, so
    // nothing resolves and every call has to answer with something harmless.
    fn absent() -> EmbedderClient {
        EmbedderClient::new(Arc::new(|| None))
    }

    #[test]
    fn an_absent_sidecar_reports_no_dimensions_rather_than_failing() {
        assert_eq!(absent().dim(), 0);
    }

    #[test]
    fn an_absent_sidecar_embeds_to_nothing() {
        let client = absent();
        assert!(client.embed("a title").is_empty());
        assert!(client.embed_batch(&["a".to_string(), "b".to_string()]).is_empty());
    }

    #[test]
    fn an_absent_sidecar_floors_relevance_at_one_so_nothing_is_recommended() {
        // Not 0.0: a floor of zero would let every candidate through on a
        // similarity nothing computed, which is worse than recommending none.
        assert_eq!(absent().relevance_floor(), 1.0);
    }

    #[test]
    fn a_resolver_that_answers_but_cannot_be_reached_still_degrades_quietly() {
        // Port 1 on loopback refuses immediately, standing in for a sidecar that
        // is registered but not serving.
        let client = EmbedderClient::new(Arc::new(|| {
            Some(("http://127.0.0.1:1".to_string(), "token".to_string()))
        }));
        assert_eq!(client.dim(), 0);
        assert!(client.embed("x").is_empty());
    }
}
