use serde_json::{json, Value};

use crate::api::test_support::{get, point_store_at, registry_offering, test_app, TestApp};

fn row(id: &str, server: &str) -> Value {
    json!({
        "schemaVersion": 3, "id": id, "name": id, "version": "1.0.0",
        "description": "What it does",
        "tagline": "Find this server from the television.",
        "translations": { "fr": { "tagline": "Retrouvez ce serveur depuis la télévision." } },
        "engines": { "server": server },
        "permissions": { "net": { "discovery": ["mdns"] } },
        "artifacts": [{ "target": null, "url": format!("https://x/{id}.kmod"), "size": 2048, "sha256": "aa" }],
    })
}

async fn catalog(t: &TestApp) -> Value {
    get(&t.app, "/api/admin/store/catalog", Some(&t.token))
        .await
        .1
}

#[tokio::test]
async fn the_catalog_offers_the_setup_what_the_official_registry_lists_in_its_order() {
    let t = test_app();
    let index = json!([
        row("tv.kroma.mdns", ">=0.0.1"),
        row("tv.kroma.remote", ">=0.0.1")
    ]);
    point_store_at(
        &t,
        &registry_offering(index, &["tv.kroma.remote", "tv.kroma.mdns"]).await,
    );

    let body = catalog(&t).await;

    assert_eq!(body["setup"], json!(["tv.kroma.remote", "tv.kroma.mdns"]));
}

#[tokio::test]
async fn the_setup_offer_leaves_out_a_module_the_registry_does_not_serve() {
    let t = test_app();
    let index = json!([row("tv.kroma.mdns", ">=0.0.1")]);
    point_store_at(
        &t,
        &registry_offering(index, &["tv.kroma.gone", "tv.kroma.mdns"]).await,
    );

    let body = catalog(&t).await;

    assert_eq!(body["setup"], json!(["tv.kroma.mdns"]));
}

#[tokio::test]
async fn an_offered_row_carries_its_words_size_permissions_and_verdict() {
    let t = test_app();
    let index = json!([row("tv.kroma.mdns", ">=999.0.0")]);
    point_store_at(&t, &registry_offering(index, &["tv.kroma.mdns"]).await);

    let offered = catalog(&t).await["modules"][0].clone();

    assert_eq!(
        offered["tagline"],
        json!("Find this server from the television.")
    );
    assert_eq!(
        offered["translations"]["fr"]["tagline"],
        json!("Retrouvez ce serveur depuis la télévision.")
    );
    assert_eq!(offered["size"], json!(2048));
    assert_eq!(offered["permissions"]["net"]["discovery"], json!(["mdns"]));
    assert_eq!(offered["compatible"], json!(false));
    assert_eq!(offered["refusal"]["kind"], json!("engine"));
}
