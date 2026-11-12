use kroma_module_sdk::host::testing::StubHost;

use super::*;

fn indexers_through_the_vpn() -> StubHost {
    StubHost::new().with_setting("acqIndexersUseVpn", serde_json::json!(true))
}

#[test]
fn an_indexer_is_not_reached_directly_while_the_vpn_it_must_use_is_down() {
    let err = route_for(&indexers_through_the_vpn(), "https://tracker.example.org/")
        .unwrap_err()
        .to_string();

    assert!(err.contains("no VPN is running"), "{err}");
}

#[test]
fn an_indexer_goes_through_the_vpn_while_the_vpn_is_up() {
    let host = indexers_through_the_vpn().with_network_seal(NetworkSeal::Up);

    let route = route_for(&host, "https://tracker.example.org/").unwrap();

    assert!(route.is_some());
}

#[test]
fn an_indexer_on_the_local_network_is_reached_directly_even_behind_the_vpn() {
    let route = route_for(&indexers_through_the_vpn(), "http://192.168.1.20:9117/api");

    assert_eq!(route.unwrap(), None);
}

#[test]
fn without_the_vpn_option_an_indexer_is_reached_directly() {
    assert_eq!(
        route_for(&StubHost::new(), "https://tracker.example.org/").unwrap(),
        None
    );
}

fn endpoint() -> Endpoint {
    Endpoint {
        url: "http://jackett".into(),
        api_key: "k".into(),
        categories: vec![2000],
        proxy: None,
    }
}

fn body(query: &Query) -> serde_json::Value {
    let caps = Caps {
        search_tmdb: true,
        ..Default::default()
    };
    let endpoint = endpoint();
    serde_json::to_value(SearchReq {
        endpoint: &endpoint,
        query: wire_query(query),
        caps: &caps,
    })
    .unwrap()
}

#[test]
fn a_movie_query_crosses_under_the_keys_the_provider_parses() {
    let json = body(&Query::Movie {
        tmdb_id: Some(603),
        imdb_id: None,
        title: "The Matrix".into(),
        year: Some(1999),
    });

    assert_eq!(json["endpoint"]["url"], "http://jackett");
    assert_eq!(json["endpoint"]["api_key"], "k");
    assert_eq!(json["endpoint"]["categories"][0], 2000);
    assert_eq!(json["caps"]["search_tmdb"], true);
    assert_eq!(json["query"]["Movie"]["tmdb_id"], 603);
    assert_eq!(json["query"]["Movie"]["title"], "The Matrix");
    assert_eq!(json["query"]["Movie"]["year"], 1999);
}

#[test]
fn an_episode_query_carries_its_numbers() {
    let json = body(&Query::Episode {
        tmdb_id: None,
        title: "Severance".into(),
        season: 2,
        episode: 7,
    });

    assert_eq!(json["query"]["Episode"]["season"], 2);
    assert_eq!(json["query"]["Episode"]["episode"], 7);
}

#[test]
fn a_free_text_query_crosses_as_a_titled_movie() {
    let json = body(&Query::Text {
        query: "some.release.name".into(),
    });

    assert_eq!(json["query"]["Movie"]["title"], "some.release.name");
    assert!(json["query"]["Movie"]["tmdb_id"].is_null());
}

#[test]
fn a_providers_leaner_release_deserializes() {
    let json = serde_json::json!({
        "title": "The.Matrix.1999.1080p",
        "guid": "g",
        "size_bytes": 42,
    });

    let release: Release = serde_json::from_value(json).unwrap();

    assert_eq!(release.title, "The.Matrix.1999.1080p");
    assert_eq!(release.size_bytes, Some(42));
    assert_eq!(release.grabs, None);
    assert!(release.categories.is_empty());
}

#[test]
fn a_providers_volume_factors_reach_the_release_a_sweep_reads() {
    let json = serde_json::json!({
        "title": "The.Matrix.1999.1080p",
        "guid": "g",
        "download_volume_factor": 0.0,
        "upload_volume_factor": 2.0,
    });

    let release: Release = serde_json::from_value(json).unwrap();

    assert_eq!(release.download_volume_factor, Some(0.0));
    assert_eq!(release.upload_volume_factor, Some(2.0));
}

#[test]
fn caps_deserialize_from_what_the_provider_reports() {
    let json = serde_json::json!({ "search_tmdb": true, "server_title": "Jackett" });

    let caps: Caps = serde_json::from_value(json).unwrap();

    assert!(caps.search_tmdb);
    assert!(!caps.tv_search_season);
    assert_eq!(caps.server_title.as_deref(), Some("Jackett"));
}
