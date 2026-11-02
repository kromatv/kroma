use super::parse::{index_url, parse_module, sha256_from_sri};
use super::*;

fn base64_of(hex: &str) -> String {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.encode(hex::decode(hex).unwrap())
}

fn artifact(target: Option<&str>) -> Artifact {
    Artifact {
        target: target.map(str::to_string),
        url: format!("https://x/{}.kmod", target.unwrap_or("universal")),
        size: Some(1),
        sha256: Some("00".into()),
    }
}

#[test]
fn the_component_is_taken_and_every_native_build_beside_it_is_passed_over() {
    let entry = CatalogModule {
        artifacts: vec![
            artifact(Some("x86_64-unknown-linux-musl")),
            artifact(None),
            artifact(Some("aarch64-apple-darwin")),
        ],
        ..test_module("a.b", "1.0.0")
    };

    let picked = pick_artifact(&entry).unwrap();

    assert!(picked.target.is_none());
    assert_eq!(compat_verdict(&entry), Ok(()));
}

#[test]
fn a_module_published_only_as_native_builds_is_listed_but_not_offered() {
    let entry = CatalogModule {
        artifacts: vec![
            artifact(Some("x86_64-unknown-linux-musl")),
            artifact(Some("aarch64-apple-darwin")),
        ],
        ..test_module("a.b", "1.0.0")
    };

    let refusal = compat_verdict(&entry).unwrap_err();

    assert!(pick_artifact(&entry).is_none());
    assert_eq!(refusal, Refusal::Native);
    assert_eq!(
        serde_json::to_value(&refusal).unwrap(),
        json!({ "kind": "native" })
    );
    assert!(refusal.reason().contains("native build"), "{}", refusal.reason());
}

#[test]
fn an_sri_checksum_becomes_the_hex_digest_the_installer_compares() {
    let hex = "ab".repeat(32);
    let sri = format!("sha256-{}", base64_of(&hex));
    assert_eq!(sha256_from_sri(&sri).as_deref(), Some(hex.as_str()));
    assert_eq!(
        sha256_from_sri(&format!("  {sri}  ")).as_deref(),
        Some(hex.as_str())
    );
}

#[test]
fn an_integrity_this_server_cannot_check_is_refused_rather_than_trusted() {
    assert!(sha256_from_sri("md5-abc").is_none());
    assert!(sha256_from_sri("nonsense").is_none());
    assert!(sha256_from_sri("sha256-!!!").is_none());
    // Right prefix, wrong digest length: a truncated hash must not pass.
    assert!(sha256_from_sri("sha256-3q2+7w==").is_none());
}

#[test]
fn parse_reads_an_rfc_110_record() {
    let rfc: Value = serde_json::from_str(&format!(
        r#"{{ "id": "a.b", "name": "AB", "version": "0.2.0", "engines": {{ "server": ">=0.1.4" }},
              "dependencies": {{ "c.d": "^0.1.0" }},
              "optionalDependencies": {{ "g.h": "^0.2.0" }},
              "artifacts": [{{ "target": "x86_64-unknown-linux-musl",
                               "url": "https://x/a.b.kmod", "size": 5,
                               "integrity": "sha256-{}" }}] }}"#,
        base64_of(&"cd".repeat(32)),
    ))
    .unwrap();
    let m = parse_module(&rfc).unwrap();
    assert_eq!(
        m.dependencies,
        vec![("c.d".to_string(), Some("^0.1.0".to_string()))]
    );
    assert_eq!(
        m.optional_dependencies,
        vec![("g.h".to_string(), Some("^0.2.0".to_string()))]
    );
    assert_eq!(
        m.artifacts[0].sha256.as_deref(),
        Some("cd".repeat(32).as_str())
    );
}

#[test]
fn a_descriptor_is_followed_to_the_index_beside_it_and_a_catalog_is_not() {
    let descriptor: Value = serde_json::from_str(
        r#"{ "apiVersion": 1, "name": "R", "url": "https://elsewhere.example",
             "modules": ["a.b", "c.d"] }"#,
    )
    .unwrap();
    assert_eq!(
        index_url(&descriptor, "https://r.example/registry.json")
            .unwrap()
            .as_deref(),
        // Resolved against where it was fetched, NOT the `url` it declares.
        Some("https://r.example/index.json"),
    );

    let catalog: Value =
        serde_json::from_str(r#"{ "schema": 2, "modules": [{ "id": "a.b" }] }"#).unwrap();
    assert!(index_url(&catalog, "https://r.example/modules.json")
        .unwrap()
        .is_none());
}

#[test]
fn a_registry_speaking_a_newer_contract_is_refused() {
    let future: Value =
        serde_json::from_str(r#"{ "apiVersion": 2, "modules": ["a.b"] }"#).unwrap();
    let err = index_url(&future, "https://r.example/registry.json").unwrap_err();
    assert!(err.to_string().contains("apiVersion 2"), "{err}");
}

#[test]
fn parse_reads_a_full_record() {
    let entry: Value = serde_json::from_str(
        r#"{ "schemaVersion": 2, "id": "a.b", "name": "AB", "version": "0.2.0",
             "engines": { "server": ">=0.1.4" }, "library": false,
             "dependencies": { "c.d": "^0.1.0", "e.f": "*" },
             "optionalDependencies": { "g.h": "^0.2.0" },
             "contributes": [{ "point": "tv.kroma.torrents/download-client", "id": "qbittorrent", "label": "qBittorrent" }],
             "consumes": [{ "point": "tv.kroma.indexer/search" }, { "point": "tv.kroma.torrents/download-client", "id": "rqbit" }],
             "artifacts": [{ "target": "x86_64-unknown-linux-musl",
                             "url": "https://x/a.b-x86_64-unknown-linux-musl.kmod",
                             "size": 5, "sha256": "ab" }] }"#,
    )
    .unwrap();
    let m = parse_module(&entry).unwrap();
    assert_eq!(m.schema_version, 2);
    assert_eq!(m.version, "0.2.0");
    assert_eq!(m.engines.get("server").map(String::as_str), Some(">=0.1.4"));
    // A "*" range normalizes away, so the planner sees "no constraint".
    assert_eq!(
        m.dependencies,
        vec![
            ("c.d".to_string(), Some("^0.1.0".to_string())),
            ("e.f".to_string(), None)
        ]
    );
    assert_eq!(
        m.optional_dependencies,
        vec![("g.h".to_string(), Some("^0.2.0".to_string()))]
    );
    assert_eq!(
        m.contributes,
        vec![(
            "tv.kroma.torrents/download-client".to_string(),
            Some("qbittorrent".to_string())
        )]
    );
    assert_eq!(
        m.consumes,
        vec![
            ("tv.kroma.indexer/search".to_string(), None),
            (
                "tv.kroma.torrents/download-client".to_string(),
                Some("rqbit".to_string())
            ),
        ]
    );
    assert_eq!(m.artifacts.len(), 1);
    assert_eq!(
        m.artifacts[0].target.as_deref(),
        Some("x86_64-unknown-linux-musl")
    );
}

#[test]
fn a_record_built_for_another_contract_is_listed_but_not_offered() {
    // Not dropped: the Store shows it with the reason, which is more use than
    // a module silently missing from the shelf.
    let old: Value = serde_json::from_str(
        r#"{ "id": "a.b", "name": "AB", "version": "0.1.0",
             "artifacts": [{ "target": null, "url": "https://x/a.b.kmod" }] }"#,
    )
    .unwrap();
    let m = parse_module(&old).unwrap();
    assert_eq!(m.schema_version, 0);
    let refusal = compat_verdict(&m).unwrap_err();
    assert_eq!(
        refusal,
        Refusal::Schema {
            built: 0,
            speaks: u64::from(kroma_module_manifest::MODULE_SCHEMA_VERSION)
        }
    );
    assert!(refusal.reason().contains("manifest schema v0"));
}
