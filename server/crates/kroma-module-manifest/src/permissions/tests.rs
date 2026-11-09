use serde_json::json;

use super::*;

fn parse(value: serde_json::Value) -> Result<Permissions, serde_json::Error> {
    serde_json::from_value(value)
}

fn torrents() -> Permissions {
    parse(json!({
        "net": {
            "connect": [
                { "purpose": "peers", "to": ["public"], "proto": ["tcp"] },
                { "purpose": "torrent-file", "to": ["public", "lan"], "ports": [80, 443] },
                { "purpose": "seal-check", "to": ["setting:vpnCheckUrl"] }
            ],
            "listen": [{ "purpose": "peers", "port": "setting:rqbitPort" }]
        },
        "fs": { "read": ["media"], "write": ["module", "downloads"] }
    }))
    .unwrap()
}

fn attempt<'a>(
    purpose: &'a str,
    host: &'a str,
    local: bool,
    port: u16,
    proto: Proto,
) -> Attempt<'a> {
    Attempt {
        purpose,
        host,
        host_is_local: local,
        port,
        proto,
    }
}

fn no_settings(_: &str) -> Vec<String> {
    Vec::new()
}

#[test]
fn a_declared_connection_is_allowed() {
    let p = torrents();

    assert!(p.allows_connect(
        &attempt("peers", "198.51.100.7", false, 51413, Proto::Tcp),
        &no_settings
    ));
    assert!(p.allows_connect(
        &attempt("torrent-file", "jackett", true, 443, Proto::Tcp),
        &no_settings
    ));
}

#[test]
fn a_purpose_is_declared_by_an_entry_named_for_it_or_for_its_dotted_parent() {
    let p = torrents();

    let declared = ["peers", "peers.announce", "peersx", "torrent", "seal-check"]
        .map(|purpose| p.declares_purpose(purpose));

    assert_eq!(declared, [true, true, false, false, true]);
}

#[test]
fn anything_the_declaration_does_not_cover_is_denied() {
    let p = torrents();

    assert!(!p.allows_connect(
        &attempt("peers", "198.51.100.7", false, 6881, Proto::Udp),
        &no_settings
    ));
    assert!(!p.allows_connect(
        &attempt("peers", "192.168.1.5", true, 51413, Proto::Tcp),
        &no_settings
    ));
    assert!(!p.allows_connect(
        &attempt("torrent-file", "x.example", false, 8080, Proto::Tcp),
        &no_settings
    ));
    assert!(!p.allows_connect(
        &attempt("telemetry", "x.example", false, 443, Proto::Tcp),
        &no_settings
    ));
    assert!(!Permissions::default().allows_connect(
        &attempt("peers", "198.51.100.7", false, 51413, Proto::Tcp),
        &no_settings
    ));
}

#[test]
fn a_setting_destination_allows_the_hosts_the_operator_configured_and_no_other() {
    let p = torrents();
    let configured = |key: &str| {
        assert_eq!(key, "vpnCheckUrl");
        vec!["api.ipify.org".to_string()]
    };

    assert!(p.allows_connect(
        &attempt("seal-check", "API.ipify.org", false, 443, Proto::Tcp),
        &configured
    ));
    assert!(!p.allows_connect(
        &attempt("seal-check", "evil.example", false, 443, Proto::Tcp),
        &configured
    ));
}

#[test]
fn a_domain_pattern_covers_the_domain_and_its_subdomains_only() {
    let p = parse(json!({ "net": { "connect": [
        { "purpose": "metadata", "to": ["*.themoviedb.org"] }
    ] } }))
    .unwrap();
    let to = |host: &str| {
        p.allows_connect(
            &attempt("metadata", host, false, 443, Proto::Tcp),
            &no_settings,
        )
    };

    assert!(to("themoviedb.org"));
    assert!(to("api.themoviedb.org"));
    assert!(to("image.themoviedb.org."));
    assert!(!to("themoviedb.org.evil.example"));
    assert!(!to("notthemoviedb.org"));
}

#[test]
fn a_declared_purpose_covers_a_call_made_for_one_of_its_dotted_children() {
    let p = parse(json!({ "net": { "connect": [
        { "purpose": "metadata", "to": ["api.themoviedb.org"], "ports": [443] }
    ] } }))
    .unwrap();
    let for_purpose = |purpose: &str| {
        let tmdb = attempt(purpose, "api.themoviedb.org", false, 443, Proto::Tcp);
        p.allows_connect(&tmdb, &no_settings)
    };

    assert!(for_purpose("metadata"));
    assert!(for_purpose("metadata.discover"));
    assert!(!for_purpose("metadatax"));
}

#[test]
fn a_misspelt_permission_is_refused_rather_than_ignored() {
    assert!(parse(json!({ "network": {} })).is_err());
    assert!(parse(json!({ "net": { "conect": [] } })).is_err());
    assert!(parse(json!({ "fs": { "read": ["/etc"] } })).is_err());
    assert!(parse(json!({ "media": ["transcode"] })).is_err());
    assert!(parse(
        json!({ "net": { "connect": [{ "purpose": "p", "to": ["public"], "proto": ["icmp"] }] } })
    )
    .is_err());
}

#[test]
fn a_media_tool_is_read_by_its_name() {
    let p = parse(json!({ "media": ["decode"] })).unwrap();

    assert_eq!(p.media, [MediaTool::Decode]);
    assert_eq!(serde_json::to_value(&p).unwrap(), json!({ "net": {}, "fs": {}, "media": ["decode"] }));
}

#[test]
fn a_well_formed_block_has_no_problem() {
    assert_eq!(torrents().problem(), None);
    assert_eq!(Permissions::default().problem(), None);
}

#[test]
fn each_unusable_declaration_is_named() {
    let problem = |value: serde_json::Value| parse(value).unwrap().problem().unwrap();

    assert!(
        problem(json!({ "net": { "connect": [{ "purpose": "Peers", "to": ["public"] }] } }))
            .contains("purpose name")
    );
    assert!(
        problem(json!({ "net": { "connect": [{ "purpose": "peers", "to": [] }] } }))
            .contains("no destination")
    );
    assert!(
        problem(json!({ "net": { "connect": [{ "purpose": "peers", "to": ["anywhere"] }] } }))
            .contains("not a destination")
    );
    assert!(problem(
        json!({ "net": { "connect": [{ "purpose": "peers", "to": ["public"], "ports": [0] }] } })
    )
    .contains("port 0"));
    assert!(
        problem(json!({ "net": { "listen": [{ "purpose": "peers", "port": 70000 }] } }))
            .contains("1-65535")
    );
    assert!(problem(json!({ "run": ["/usr/bin/curl"] })).contains("bare binary name"));
    assert!(problem(json!({ "env": ["path"] })).contains("environment variable"));
}

#[test]
fn a_manifest_without_permissions_still_parses() {
    let manifest: crate::ModuleManifest = serde_json::from_value(json!({
        "schemaVersion": 2, "id": "com.example.old", "name": "Old", "version": "1.0.0"
    }))
    .unwrap();

    assert_eq!(manifest.permissions, None);
}

#[test]
fn a_connection_only_public_covers_reaches_public_addresses_only() {
    let reach = torrents().connect_reach(
        &attempt("peers", "tracker.example", false, 6881, Proto::Tcp),
        &|_| Vec::new(),
    );

    assert_eq!(reach, Some(Reach::PublicOnly));
}

#[test]
fn a_connection_to_the_lan_reaches_private_addresses() {
    let reach = torrents().connect_reach(
        &attempt("torrent-file", "nas", true, 80, Proto::Tcp),
        &|_| Vec::new(),
    );

    assert_eq!(reach, Some(Reach::Named));
}

#[test]
fn a_connection_to_a_host_a_setting_names_reaches_private_addresses() {
    let reach = torrents().connect_reach(
        &attempt("seal-check", "check.example", false, 443, Proto::Tcp),
        &|_| vec!["check.example".to_string()],
    );

    assert_eq!(reach, Some(Reach::Named));
}

#[test]
fn a_connection_nothing_covers_has_no_reach() {
    let reach = torrents().connect_reach(
        &attempt("analytics", "tracker.example", false, 443, Proto::Tcp),
        &|_| Vec::new(),
    );

    assert_eq!(reach, None);
}

fn block(value: serde_json::Value) -> Permissions {
    parse(value).unwrap()
}

#[test]
fn the_same_block_does_not_widen_itself() {
    assert!(!torrents().widens(&torrents()));
}

#[test]
fn an_empty_block_widens_nothing() {
    assert!(!Permissions::default().widens(&torrents()));
}

#[test]
fn a_new_destination_widens_the_block() {
    let before = block(json!({ "net": { "connect": [{ "purpose": "a", "to": ["public"] }] } }));
    let after = block(json!({ "net": { "connect": [{ "purpose": "a", "to": ["public", "lan"] }] } }));

    assert!(after.widens(&before));
    assert!(!before.widens(&after));
}

#[test]
fn a_new_purpose_widens_the_block() {
    let before = block(json!({ "net": { "connect": [{ "purpose": "a", "to": ["public"] }] } }));
    let after = block(json!({ "net": { "connect": [{ "purpose": "b", "to": ["public"] }] } }));

    assert!(after.widens(&before));
}

#[test]
fn losing_a_port_limit_widens_the_block() {
    let before = block(json!({ "net": { "connect": [{ "purpose": "a", "to": ["x.example"], "ports": [443] }] } }));
    let after = block(json!({ "net": { "connect": [{ "purpose": "a", "to": ["x.example"] }] } }));

    assert!(after.widens(&before));
    assert!(!before.widens(&after));
}

#[test]
fn a_new_protocol_widens_the_block() {
    let before = block(json!({ "net": { "connect": [{ "purpose": "a", "to": ["public"] }] } }));
    let after = block(json!({ "net": { "connect": [{ "purpose": "a", "to": ["public"], "proto": ["tcp", "udp"] }] } }));

    assert!(after.widens(&before));
}

#[test]
fn the_host_network_a_listener_a_root_a_program_a_media_tool_and_a_variable_each_widen_it() {
    let before = Permissions::default();

    for after in [
        json!({ "net": { "host": true } }),
        json!({ "net": { "listen": [{ "purpose": "a", "port": 1 }] } }),
        json!({ "fs": { "read": ["media"] } }),
        json!({ "fs": { "write": ["media"] } }),
        json!({ "run": ["ffmpeg"] }),
        json!({ "media": ["decode"] }),
        json!({ "env": ["X"] }),
    ] {
        assert!(block(after.clone()).widens(&before), "{after}");
    }
}

fn listen(value: serde_json::Value) -> Listen {
    serde_json::from_value(value).unwrap()
}

#[test]
fn a_listener_holds_its_port_and_the_ones_its_count_adds() {
    let bridges = listen(json!({ "purpose": "proxy", "port": "setting:vpnLocalPort", "count": 3 }));

    let ports = bridges.ports(&|key| (key == "vpnLocalPort").then_some(25345));

    assert_eq!(ports, [25345, 25346, 25347]);
}

#[test]
fn a_listener_without_a_count_holds_one_port() {
    assert_eq!(listen(json!({ "purpose": "a", "port": 4000 })).ports(&|_| None), [4000]);
}

#[test]
fn a_listener_on_a_setting_nobody_set_holds_nothing() {
    let unset = listen(json!({ "purpose": "a", "port": "setting:unset", "count": 2 }));

    assert!(unset.ports(&|_| None).is_empty());
}

#[test]
fn a_range_stops_at_the_last_port_there_is() {
    let top = listen(json!({ "purpose": "a", "port": 65534, "count": 4 }));

    assert_eq!(top.ports(&|_| None), [65534, 65535]);
}

#[test]
fn a_listener_count_is_between_one_and_sixteen() {
    let problem = |count: u64| {
        block(json!({ "net": { "listen": [{ "purpose": "a", "port": 1, "count": count }] } }))
            .problem()
    };

    assert!(problem(0).unwrap().contains("count"));
    assert!(problem(17).unwrap().contains("count"));
    assert_eq!(problem(16), None);
}

#[test]
fn listening_on_more_ports_than_before_widens_it() {
    let before = block(json!({ "net": { "listen": [{ "purpose": "a", "port": 1 }] } }));

    let after = block(json!({ "net": { "listen": [{ "purpose": "a", "port": 1, "count": 5 }] } }));

    assert!(after.widens(&before));
}
