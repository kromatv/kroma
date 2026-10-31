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
fn a_misspelt_permission_is_refused_rather_than_ignored() {
    assert!(parse(json!({ "network": {} })).is_err());
    assert!(parse(json!({ "net": { "conect": [] } })).is_err());
    assert!(parse(json!({ "fs": { "read": ["/etc"] } })).is_err());
    assert!(parse(
        json!({ "net": { "connect": [{ "purpose": "p", "to": ["public"], "proto": ["icmp"] }] } })
    )
    .is_err());
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
