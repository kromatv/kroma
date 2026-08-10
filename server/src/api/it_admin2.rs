//! Integration tests for the admin dashboard reads + clean settings mutations
//! that don't touch the network or kick a background job: metrics, live-session
//! terminate, analytics (`admin/stats.rs`), the storage/settings guards
//! (`admin/storage.rs`, `admin/settings.rs`), and the module-store catalog
//! (`admin/store/*`) driven against a deliberately-unreachable local registry.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, seed_session, send, test_app, text};
use crate::model::Permission;

fn member(t: &crate::api::test_support::TestApp, tag: &str) -> String {
    let (_id, token) = seed_session(
        &t.state,
        &format!("{tag}@test.dev"),
        tag,
        &[Permission::Playback],
    );
    token
}

#[tokio::test]
async fn metrics_snapshot_is_admin_only() {
    let t = test_app();
    let (status, body) = get(&t.app, "/api/admin/metrics", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.is_object());

    let m = member(&t, "metrics-member");
    let (status, _) = get(&t.app, "/api/admin/metrics", Some(&m)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn terminate_session_is_idempotent_for_an_unknown_id() {
    let t = test_app();
    // No such live session -> still a clean ack (the client should stop anyway).
    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/sessions/ghost/stop",
        Some(&t.token),
        Some(json!({ "message": "Session terminée par l'administrateur" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["ok"], json!(true));

    let m = member(&t, "terminate-member");
    let (status, _) = send(&t.app, "POST", "/api/admin/sessions/ghost/stop", Some(&m), Some(json!({}))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn stats_top_users_and_history_return_their_shapes() {
    let t = test_app();

    let (status, top) = get(&t.app, "/api/admin/stats/top-users?days=7", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(top["users"].is_array());

    let (status, hist) = get(&t.app, "/api/admin/stats/history?days=28", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    // 28 days -> at least one weekly bucket; totals default to zero with no history.
    assert!(hist["buckets"].as_array().map(|b| !b.is_empty()).unwrap_or(false));
    assert_eq!(hist["totalFilmsMs"], json!(0));
    assert_eq!(hist["totalTvMs"], json!(0));
}

#[tokio::test]
async fn stats_are_admin_only() {
    let t = test_app();
    let m = member(&t, "stats-member");
    for uri in ["/api/admin/stats/top-users", "/api/admin/stats/history", "/api/admin/stats/overview"] {
        let (status, _) = get(&t.app, uri, Some(&m)).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{uri} should be admin-only");
    }
}

#[tokio::test]
async fn cache_clear_requires_settings_manage() {
    let t = test_app();
    // Guard fires before any filesystem/job work, so this never wipes a cache.
    let m = member(&t, "cache-member");
    let (status, _) = send(&t.app, "POST", "/api/admin/cache/clear", Some(&m), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn cache_clear_wipes_the_transcode_and_image_dirs() {
    let t = test_app();
    let data = t.state.config.data_dir.clone();
    // Seed a file + a nested sub-directory in the caches so clear_dir exercises
    // both the file-remove and recursive-dir-remove branches.
    let hls = data.join("hls");
    std::fs::create_dir_all(hls.join("sub")).unwrap();
    std::fs::write(hls.join("seg.ts"), b"abcd").unwrap();
    let images = data.join("images");
    std::fs::create_dir_all(&images).unwrap();
    std::fs::write(images.join("a.webp"), b"xy").unwrap();

    let (status, body) = send(&t.app, "POST", "/api/admin/cache/clear", Some(&t.token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["freedBytes"].as_u64().unwrap_or(0) >= 6, "freed the seeded bytes");
    // The dirs are emptied (kept) rather than removed.
    assert!(!hls.join("seg.ts").exists());
    assert!(!hls.join("sub").exists());
    assert!(!images.join("a.webp").exists());
}

#[tokio::test]
async fn reset_metadata_reports_cleared_counts_and_is_gated() {
    let t = test_app();

    // A settings-only member is refused before any DB work.
    let m = member(&t, "reset-member");
    let (status, _) = send(&t.app, "POST", "/api/admin/cache/reset-metadata", Some(&m), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // The owner clears all resolved metadata; the demo has none, so counts are 0.
    let (status, body) =
        send(&t.app, "POST", "/api/admin/cache/reset-metadata", Some(&t.token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["items"], json!(0));
    assert_eq!(body["shows"], json!(0));
}

#[tokio::test]
async fn settings_read_and_write_require_settings_manage() {
    let t = test_app();
    let m = member(&t, "settings-member");
    let (status, _) = get(&t.app, "/api/admin/settings?view=general", Some(&m)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) =
        send(&t.app, "PUT", "/api/admin/settings", Some(&m), Some(json!({ "serverName": "x" }))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn settings_put_persists_live_reconfig_keys() {
    let t = test_app();

    // transcodeCacheLimit takes the HLS-budget refresh branch.
    let (status, body) = send(
        &t.app,
        "PUT",
        "/api/admin/settings",
        Some(&t.token),
        Some(json!({ "transcodeCacheLimit": "10 Go" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["updated"].as_array().unwrap().iter().any(|k| k == "transcodeCacheLimit"));

    // mediaConcurrency takes the ffmpeg-gate capacity branch.
    let (status, body) = send(
        &t.app,
        "PUT",
        "/api/admin/settings",
        Some(&t.token),
        Some(json!({ "mediaConcurrency": "3" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["updated"].as_array().unwrap().iter().any(|k| k == "mediaConcurrency"));

    // A view we didn't touch still renders (network view groups + values).
    let (status, view) = get(&t.app, "/api/admin/settings?view=transcoder", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(view["view"], json!("transcoder"));
}

#[tokio::test]
async fn store_catalog_requires_settings_manage() {
    let t = test_app();
    let m = member(&t, "store-member");
    let (status, _) = get(&t.app, "/api/admin/store/catalog", Some(&m)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn store_catalog_reports_an_unreachable_registry_cleanly() {
    let t = test_app();
    // Point the store at a local port that refuses instantly: the fetch fails,
    // the handler returns 200 with the failure in `error` + an empty module list
    // (never the network). Exercises registry_url + fetch(error) + unreachable().
    t.state.settings.set_patch(
        &t.state.db,
        [("moduleRegistryUrl".to_string(), json!("http://127.0.0.1:9/none.json"))].into_iter().collect(),
    );
    let (status, body) = get(&t.app, "/api/admin/store/catalog", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["registryUrl"], json!("http://127.0.0.1:9/none.json"));
    assert_eq!(body["modules"].as_array().map(Vec::len), Some(0));
    assert!(body["error"].is_string());
}

async fn spawn_registry(body: serde_json::Value) -> String {
    let app = axum::Router::new().route(
        "/modules.json",
        axum::routing::get(move || {
            let body = body.clone();
            async move { axum::Json(body) }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    format!("http://{addr}/modules.json")
}

#[tokio::test]
async fn store_catalog_enriches_a_reachable_registry() {
    let t = test_app();
    let url = spawn_registry(json!({
        "schema": 2,
        "modules": [
            // Universal (library) bundle: satisfies any host -> compatible.
            { "id": "tv.kroma.lib", "name": "Lib", "version": "1.0.0", "library": true,
              "dependsOn": { "tv.kroma.dep": "^0.1.0" },
              "artifacts": [{ "target": null, "url": "https://x/lib.kmod", "size": 10, "sha256": "aa" }] },
            // minServer far in the future -> incompatible with a reason.
            { "id": "tv.kroma.future", "name": "Future", "version": "2.0.0", "minServer": "999.0.0",
              "artifacts": [{ "target": null, "url": "https://x/future.kmod" }] },
            // Only a foreign-arch build -> no artifact for this platform.
            { "id": "tv.kroma.alien", "name": "Alien", "version": "1.0.0",
              "artifacts": [{ "target": "sparc-unknown-none-elf", "url": "https://x/alien.kmod" }] }
        ]
    }))
    .await;
    t.state.settings.set_patch(
        &t.state.db,
        [("moduleRegistryUrl".to_string(), json!(url.clone()))].into_iter().collect(),
    );

    let (status, body) = get(&t.app, "/api/admin/store/catalog", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["schema"], json!(2));
    assert_eq!(body["registryUrl"], json!(url));
    assert!(body["serverVersion"].is_string());
    assert!(body["target"].is_string());

    let mods = body["modules"].as_array().expect("modules");
    assert_eq!(mods.len(), 3);
    let by_id = |id: &str| mods.iter().find(|m| m["id"] == json!(id)).unwrap();

    let lib = by_id("tv.kroma.lib");
    assert_eq!(lib["compatible"], json!(true));
    assert_eq!(lib["library"], json!(true));
    assert!(lib["url"].is_string(), "a universal artifact resolves an install URL");
    assert!(lib["installedVersion"].is_null());
    assert_eq!(lib["updateAvailable"], json!(false));
    assert_eq!(lib["dependsOn"][0]["id"], json!("tv.kroma.dep"));

    let future = by_id("tv.kroma.future");
    assert_eq!(future["compatible"], json!(false));
    assert!(future["reason"].as_str().unwrap_or_default().contains("requires"));

    let alien = by_id("tv.kroma.alien");
    assert_eq!(alien["compatible"], json!(false));
    assert!(alien["url"].is_null(), "no build for this platform -> no install URL");
}

fn point_store_at(t: &crate::api::test_support::TestApp, url: &str) {
    t.state.settings.set_patch(
        &t.state.db,
        [("moduleRegistryUrl".to_string(), json!(url))].into_iter().collect(),
    );
}

#[tokio::test]
async fn the_install_plan_pulls_dependencies_first_and_offers_the_rest() {
    let t = test_app();
    let url = spawn_registry(json!({
        "schema": 2,
        "modules": [
            { "id": "tv.x.app", "name": "App", "version": "1.0.0",
              "dependsOn": { "tv.x.lib": "^1.0.0" },
              "optionalDependsOn": { "tv.x.vpn": "*" },
              "requires": [{ "kind": "download-client" }],
              "artifacts": [{ "target": null, "url": "https://x/app.kmod", "size": 30 }] },
            { "id": "tv.x.lib", "name": "Lib", "version": "1.4.0", "library": true,
              "artifacts": [{ "target": null, "url": "https://x/lib.kmod", "size": 12 }] },
            { "id": "tv.x.vpn", "name": "VPN", "version": "1.0.0",
              "artifacts": [{ "target": null, "url": "https://x/vpn.kmod", "size": 7 }] },
            { "id": "tv.x.engine", "name": "Engine", "version": "1.0.0",
              "provides": [{ "kind": "download-client", "id": "rqbit" }],
              "artifacts": [{ "target": null, "url": "https://x/engine.kmod", "size": 5 }] }
        ]
    }))
    .await;
    point_store_at(&t, &url);

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/store/plan",
        Some(&t.token),
        Some(json!({ "id": "tv.x.app" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["requested"], json!("tv.x.app"));

    let modules = body["modules"].as_array().unwrap();
    let ids: Vec<&str> = modules.iter().map(|m| m["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["tv.x.lib", "tv.x.app"], "a dependency installs before its dependent");
    assert_eq!(modules[0]["requested"], json!(false));
    assert_eq!(modules[1]["requested"], json!(true));
    assert!(modules[1]["installedVersion"].is_null());
    assert_eq!(body["totalSize"], json!(42));

    let optional = body["optional"].as_array().unwrap();
    let by_id = |id: &str| optional.iter().find(|o| o["id"] == json!(id)).unwrap();
    assert_eq!(optional.len(), 2);
    assert!(by_id("tv.x.vpn")["capability"].is_null());
    assert_eq!(by_id("tv.x.vpn")["suggested"], json!(false));
    assert_eq!(by_id("tv.x.engine")["capability"], json!("download-client"));
    assert_eq!(by_id("tv.x.engine")["suggested"], json!(true));
    assert_eq!(body["missing"].as_array().unwrap().len(), 0);

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/store/plan",
        Some(&t.token),
        Some(json!({ "id": "tv.x.app", "include": ["tv.x.app", "tv.x.vpn"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let ids: Vec<&str> =
        body["modules"].as_array().unwrap().iter().map(|m| m["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["tv.x.lib", "tv.x.app", "tv.x.vpn"]);
    assert_eq!(body["totalSize"], json!(49));
}

#[tokio::test]
async fn planning_a_module_the_registry_does_not_offer_is_a_client_error() {
    let t = test_app();
    let url = spawn_registry(json!({ "schema": 2, "modules": [] })).await;
    point_store_at(&t, &url);

    let (status, message) = text(
        &t.app,
        "POST",
        "/api/admin/store/plan",
        Some(&t.token),
        Some(json!({ "id": "tv.x.ghost" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(message, "'tv.x.ghost' is not in the registry");
}

#[tokio::test]
async fn an_official_registry_that_is_down_stops_a_plan_rather_than_offering_less() {
    let t = test_app();
    point_store_at(&t, "http://127.0.0.1:9/none.json");

    let (status, message) = text(
        &t.app,
        "POST",
        "/api/admin/store/plan",
        Some(&t.token),
        Some(json!({ "id": "tv.kroma.torrents" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(message.contains("is unreachable"), "{message}");
}

#[tokio::test]
async fn an_added_registry_that_is_down_leaves_the_official_catalog_usable() {
    let t = test_app();
    let url = spawn_registry(json!({
        "schema": 2,
        "modules": [
            { "id": "tv.x.app", "name": "App", "version": "1.0.0",
              "artifacts": [{ "target": null, "url": "https://x/app.kmod", "size": 3 }] }
        ]
    }))
    .await;
    point_store_at(&t, &url);
    t.state.settings.set_patch(
        &t.state.db,
        [(
            "moduleRegistries".to_string(),
            json!([
                { "name": "Dead", "url": "https://127.0.0.1:9/modules.json", "enabled": true },
                { "name": "Off", "url": "https://off.example/modules.json", "enabled": false },
            ]),
        )]
        .into_iter()
        .collect(),
    );

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/store/plan",
        Some(&t.token),
        Some(json!({ "id": "tv.x.app" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["modules"].as_array().unwrap().len(), 1);

    let (status, catalog) = get(&t.app, "/api/admin/store/catalog", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    let rows = catalog["registries"].as_array().unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0]["official"], json!(true));
    assert!(rows[1]["error"].is_string(), "the unreachable one reports its failure: {}", rows[1]);
    assert_eq!(rows[2]["skipped"], json!("disabled"));
}

#[tokio::test]
async fn the_install_plan_is_closed_to_anyone_who_cannot_manage_the_server() {
    let t = test_app();
    let m = member(&t, "plan-member");
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/admin/store/plan",
        Some(&m),
        Some(json!({ "id": "tv.x.app" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn terminating_a_live_session_drops_it_and_tells_the_player_to_stop() {
    let t = test_app();
    let item = crate::api::test_support::demo_item_id("The Matrix");
    send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(json!({ "sessionId": "sess-kill", "itemId": item, "positionMs": 5000 })),
    )
    .await;

    let mut rx = t.state.events.subscribe();
    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/sessions/sess-kill/stop",
        Some(&t.token),
        Some(json!({ "message": "  Serveur en maintenance  " })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["ok"], json!(true));

    let mut frames = Vec::new();
    while let Ok(envelope) = rx.try_recv() {
        if let Some(json) = envelope.payload_for(&t.user_id) {
            frames.push(serde_json::from_str::<serde_json::Value>(json).expect("event is json"));
        }
    }
    let types: Vec<&str> = frames.iter().map(|f| f["type"].as_str().unwrap()).collect();
    assert_eq!(types, ["playback.terminate", "playback.stopped"]);
    assert_eq!(frames[0]["sessionId"], json!("sess-kill"));
    assert_eq!(frames[0]["message"], json!("Serveur en maintenance"));
    assert_eq!(frames[1]["count"], json!(0));

    let (_, sessions) = get(&t.app, "/api/admin/sessions", Some(&t.token)).await;
    assert_eq!(sessions["sessions"].as_array().map(Vec::len), Some(0));

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(json!({ "sessionId": "sess-kill", "itemId": item, "positionMs": 6000 })),
    )
    .await;
    assert_eq!(status, StatusCode::GONE);
}

#[tokio::test]
async fn the_admin_surface_of_a_module_that_is_not_running_is_simply_absent() {
    let t = test_app();
    for path in ["/api/admin/m/tv.kroma.ghost", "/api/admin/m/tv.kroma.ghost/settings"] {
        let (status, _) = get(&t.app, path, Some(&t.token)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
    }
}

#[tokio::test]
async fn a_finished_session_lands_in_the_weekly_watch_history() {
    let t = test_app();
    let movie = crate::api::test_support::demo_item_id("The Matrix");
    send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(json!({ "sessionId": "sess-history", "itemId": movie, "positionMs": 0 })),
    )
    .await;
    send(&t.app, "POST", "/api/playback/stop", Some(&t.token), Some(json!({ "sessionId": "sess-history" })))
        .await;

    let (status, body) = get(&t.app, "/api/admin/stats/history?days=28", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    let buckets = body["buckets"].as_array().expect("buckets");
    assert_eq!(buckets.len(), 4, "28 days is four weekly buckets");
    assert!(buckets.iter().all(|b| b["tvMs"] == json!(0)), "{body}");
    assert_eq!(body["totalTvMs"], json!(0));
    assert_eq!(body["totalFilmsMs"], buckets[3]["filmsMs"]);

    let episode = crate::api::test_support::demo_item_id("Islands");
    send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(json!({ "sessionId": "sess-tv", "itemId": episode, "positionMs": 0 })),
    )
    .await;
    send(&t.app, "POST", "/api/playback/stop", Some(&t.token), Some(json!({ "sessionId": "sess-tv" })))
        .await;
    let (_, body) = get(&t.app, "/api/admin/stats/history?days=28", Some(&t.token)).await;
    let buckets = body["buckets"].as_array().expect("buckets");
    assert_eq!(body["totalTvMs"], buckets[3]["tvMs"]);

    let (status, top) = get(&t.app, "/api/admin/stats/top-users?days=7", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        top["users"].as_array().unwrap().iter().any(|u| u["username"] == json!("owner")),
        "the viewer is in the leaderboard: {top}"
    );
}

#[tokio::test]
async fn an_official_catalog_that_reports_its_own_outage_is_a_failure_not_an_empty_shelf() {
    let t = test_app();
    let url = spawn_registry(json!({ "modules": [], "error": "upstream unavailable" })).await;
    point_store_at(&t, &url);

    let (status, catalog) = get(&t.app, "/api/admin/store/catalog", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        catalog["error"].as_str().unwrap_or_default().contains("upstream unavailable"),
        "{catalog}"
    );
    assert_eq!(catalog["modules"].as_array().map(Vec::len), Some(0));

    let (status, message) = text(
        &t.app,
        "POST",
        "/api/admin/store/plan",
        Some(&t.token),
        Some(json!({ "id": "tv.kroma.torrents" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(message.contains("is unreachable"), "{message}");
}
