#![cfg(unix)]

use std::path::PathBuf;
use std::sync::OnceLock;

use kroma_http::Loopback;
use kroma_module_host::NetworkAction;
use kroma_module_supervisor::Endpoint;

mod component_support;

use component_support::Server;
use component_support::wasm::{build_with, module_source};

const VECTOR: &str = "tv.kroma.vector";

fn vector_component() -> &'static [u8] {
    static BUILT: OnceLock<Vec<u8>> = OnceLock::new();
    BUILT.get_or_init(|| {
        build_with(
            &module_source(VECTOR).join("server"),
            "kroma-module-vector",
            "semantic",
        )
    })
}

fn embedded(server: &Server, endpoint: &Endpoint, texts: &[&str]) -> Vec<Vec<f32>> {
    server
        .as_the_core(VECTOR)
        .max_time(600)
        .post_json(
            &endpoint.url("/_port/embedder/embed_batch"),
            &serde_json::json!({ "texts": texts }),
        )
        .unwrap()
        .json()
        .unwrap()
}

#[test]
fn the_real_vector_module_embeds_with_the_lexical_backend_when_no_model_is_on_disk() {
    let server = Server::new("component-vector", NetworkAction::Direct);
    let endpoint = server.installed_as_shipped(VECTOR, vector_component());
    let body = serde_json::json!({ "texts": ["a heist thriller"] });

    let refused = Loopback::new()
        .post_json(&endpoint.url("/_port/embedder/embed_batch"), &body)
        .unwrap();
    let vectors = embedded(
        &server,
        &endpoint,
        &["a heist thriller", "a christmas comedy"],
    );
    let meta: serde_json::Value = server
        .as_the_core(VECTOR)
        .post_json(
            &endpoint.url("/_port/embedder/meta"),
            &serde_json::json!({}),
        )
        .unwrap()
        .json()
        .unwrap();

    assert_eq!(refused.status, 401, "a port call needs the port token");
    assert_eq!(vectors.len(), 2);
    assert_eq!(vectors[0].len(), 256);
    assert_ne!(vectors[0], vectors[1]);
    assert_eq!(meta["dim"], 256);
}

#[test]
#[ignore = "needs KROMA_TEST_MINILM_DIR, a folder holding the MiniLM model"]
fn the_real_vector_module_ranks_by_meaning_with_a_real_model() {
    let server = Server::new("component-vector-minilm", NetworkAction::Direct);
    let model = PathBuf::from(std::env::var_os("KROMA_TEST_MINILM_DIR").unwrap());
    let held = server.dir.path().join("models/ml-minilm");
    std::fs::create_dir_all(&held).unwrap();
    for file in ["config.json", "tokenizer.json", "model.safetensors"] {
        std::fs::hard_link(model.join(file), held.join(file)).unwrap();
    }
    let endpoint = server.installed_as_shipped(VECTOR, vector_component());

    let vectors = embedded(
        &server,
        &endpoint,
        &[
            "a heartwarming christmas movie about santa and family",
            "a festive holiday film with father christmas giving gifts",
            "a brutal documentary about tank warfare and combat",
        ],
    );

    let dot = |a: &[f32], b: &[f32]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
    assert_eq!(vectors[0].len(), 384);
    assert!(dot(&vectors[0], &vectors[1]) > dot(&vectors[0], &vectors[2]) + 0.1);
    assert!(
        !server
            .said
            .lock()
            .unwrap()
            .iter()
            .any(|line| line.contains("component stopped"))
    );
}
