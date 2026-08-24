//! The admin settings-view schema: the grouped, localised rows the console
//! renders, with each row's current value overlaid from the store.

use std::sync::OnceLock;

use serde::Serialize;
use serde_json::{json, Value};

use crate::i18n;

use super::store::Settings;

// Must come from the server binary: `env!("CARGO_PKG_VERSION")` here would be the
// engine crate's stale version, not the released server's.
static BUILD_INFO: OnceLock<(String, String, String)> = OnceLock::new();

/// Call once from the server binary; later calls are ignored.
pub fn set_build_info(
    version: impl Into<String>,
    commit: impl Into<String>,
    built: impl Into<String>,
) {
    let _ = BUILD_INFO.set((version.into(), commit.into(), built.into()));
}

fn version_label() -> String {
    let (version, commit, built) = BUILD_INFO.get().cloned().unwrap_or_else(|| {
        (env!("CARGO_PKG_VERSION").to_string(), "unknown".to_string(), "unknown".to_string())
    });
    format!("{version} ({commit} · {built})")
}

#[derive(Debug, Clone, Serialize)]
pub struct SettingRow {
    pub key: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
    // `toggle` | `select` | `text` | `value`.
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<String>,
    pub value: Value,
    pub applied: bool,
    // `secret` rows only: whether a value is stored. The value itself never
    // leaves the server.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configured: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SettingGroup {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
    pub rows: Vec<SettingRow>,
}

/// The grouped schema for one admin settings view; an unknown view yields no
/// groups.
pub fn groups(
    view: &str,
    settings: &Settings,
    config: &crate::config::Config,
    locale: &str,
) -> Vec<SettingGroup> {
    let g = |key: &str| settings.get(key);
    // Select `options` are persisted *values*, so they are deliberately not
    // translated — only labels, hints, group titles and descriptions are.
    let t = |key: &str| i18n::t(locale, key, &[]);
    let group = |title: &str, desc: Option<&str>, rows: Vec<SettingRow>| SettingGroup {
        title: t(title),
        desc: desc.map(t),
        rows,
    };
    // Only settings the server actually enforces are surfaced, never a stored-but-
    // unused control shown with a "preference saved only" badge.
    match view {
        "general" => vec![
            group(
                "admin.serverIdentity",
                Some("admin.serverIdentityDesc"),
                vec![
                    row("serverName", t("admin.serverName"), Some(t("admin.serverNameHint")), "text", &[], g("serverName"), true),
                    row("tmdbLanguage", t("admin.tmdbLanguage"), Some(t("admin.tmdbLanguageHint")), "text", &[], g("tmdbLanguage"), true),
                    row("version", t("admin.version"), None, "value", &[], json!(version_label()), true),
                ],
            ),
            group(
                "admin.preferences",
                None,
                vec![
                    row("watchAutoScan", t("admin.watchAutoScan"), Some(t("admin.watchAutoScanHint")), "toggle", &[], g("watchAutoScan"), true),
                    row("showRecentHome", t("admin.showRecentHome"), None, "toggle", &[], g("showRecentHome"), true),
                    row("publicUserList", t("admin.publicUserList"), Some(t("admin.publicUserListHint")), "toggle", &[], g("publicUserList"), true),
                    row("themeSongs", t("admin.themeSongs"), Some(t("admin.themeSongsHint")), "toggle", &[], g("themeSongs"), true),
                    row("introDetection", t("admin.introDetection"), Some(t("admin.introDetectionHint")), "select", &["off", "chapters", "fingerprint"], g("introDetection"), true),
                ],
            ),
        ],
        "network" => vec![group(
            "admin.portsDiscovery",
            None,
            vec![
                row("publicAddress", t("admin.publicAddress"), None, "value", &[], json!(public_address(config)), true),
                row("port", t("admin.port"), Some(t("admin.portHint")), "value", &[], json!(config.port.to_string()), true),
                row("localDiscovery", t("admin.localDiscovery"), Some(t("admin.localDiscoveryHint")), "toggle", &[], g("localDiscovery"), true),
                row("localNetworks", t("admin.localNetworks"), Some(t("admin.localNetworksHint")), "text", &[], g("localNetworks"), true),
                row("httpsEnabled", t("admin.httpsEnabled"), Some(t("admin.httpsEnabledHint")), "toggle", &[], g("httpsEnabled"), true),
                row("httpsPort", t("admin.httpsPort"), Some(t("admin.httpsPortHint")), "text", &[], g("httpsPort"), true),
                row("httpsRedirect", t("admin.httpsRedirect"), Some(t("admin.httpsRedirectHint")), "toggle", &[], g("httpsRedirect"), true),
            ],
        )],
        "transcoder" => vec![group(
            "admin.qualityPerf",
            Some("admin.qualityPerfDesc"),
            vec![
                row("maxConcurrent", t("admin.maxConcurrent"), Some(t("admin.maxConcurrentHint")), "select", &["2", "4", "8", "12", "16", "24", "32"], g("maxConcurrent"), true),
                row("mediaConcurrency", t("admin.mediaConcurrency"), Some(t("admin.mediaConcurrencyHint")), "select", &["0", "1", "2", "3", "4", "6", "8", "12", "16"], g("mediaConcurrency"), true),
                row("transcodeDir", t("admin.transcodeDir"), None, "value", &[], json!(transcode_dir(config)), true),
            ],
        )],
        "acquisition" => {
            // Import-target selects offer the configured libraries by name;
            // "Auto" means the first library of the matching kind.
            let libs = super::library_defs(settings, config);
            let lib_options = |kind: &str| -> Vec<String> {
                let mut opts = vec!["Auto".to_string()];
                opts.extend(libs.iter().filter(|d| d.kind == kind || d.kind.is_empty()).map(|d| d.name.clone()));
                opts
            };
            let movie_opts = lib_options("movies");
            let show_opts = lib_options("shows");
            vec![
            group(
                "admin.acqGeneral",
                Some("admin.acqGeneralDesc"),
                vec![
                    row("acqEnabled", t("admin.acqEnabled"), Some(t("admin.acqEnabledHint")), "toggle", &[], g("acqEnabled"), true),
                    row("acqAutoApprove", t("admin.acqAutoApprove"), Some(t("admin.acqAutoApproveHint")), "toggle", &[], g("acqAutoApprove"), true),
                    row("acqDeleteAfterImport", t("admin.acqDeleteAfterImport"), Some(t("admin.acqDeleteAfterImportHint")), "toggle", &[], g("acqDeleteAfterImport"), true),
                    row("acqReplaceOnUpgrade", t("admin.acqReplaceOnUpgrade"), Some(t("admin.acqReplaceOnUpgradeHint")), "toggle", &[], g("acqReplaceOnUpgrade"), true),
                    row("acqMovieLibrary", t("admin.acqMovieLibrary"), None, "select", &movie_opts.iter().map(String::as_str).collect::<Vec<_>>(), g("acqMovieLibrary"), true),
                    row("acqSeriesLibrary", t("admin.acqSeriesLibrary"), None, "select", &show_opts.iter().map(String::as_str).collect::<Vec<_>>(), g("acqSeriesLibrary"), true),
                ],
            ),
            group(
                "admin.acqQuality",
                Some("admin.acqQualityDesc"),
                vec![
                    row("acqResolution", t("admin.acqResolution"), None, "select", &["720p", "1080p", "2160p"], g("acqResolution"), true),
                    row("acqPreferHevc", t("admin.acqPreferHevc"), Some(t("admin.acqPreferHevcHint")), "toggle", &[], g("acqPreferHevc"), true),
                    row("acqMinSeeders", t("admin.acqMinSeeders"), None, "select", &["0", "1", "2", "5", "10"], g("acqMinSeeders"), true),
                    row("acqMaxSizeGbMovie", t("admin.acqMaxSizeGbMovie"), None, "select", &["5", "10", "15", "25", "40", "80"], g("acqMaxSizeGbMovie"), true),
                    row("acqMaxSizeGbEpisode", t("admin.acqMaxSizeGbEpisode"), None, "select", &["1", "2", "3", "5", "8"], g("acqMaxSizeGbEpisode"), true),
                    row("acqRequiredKeywords", t("admin.acqRequiredKeywords"), Some(t("admin.acqRequiredKeywordsHint")), "text", &[], g("acqRequiredKeywords"), true),
                    row("acqForbiddenKeywords", t("admin.acqForbiddenKeywords"), Some(t("admin.acqForbiddenKeywordsHint")), "text", &[], g("acqForbiddenKeywords"), true),
                ],
            ),
            group(
                "admin.acqEngine",
                Some("admin.acqEngineDesc"),
                vec![
                    row("rqbitPort", t("admin.rqbitPort"), Some(t("admin.rqbitPortHint")), "text", &[], g("rqbitPort"), true),
                    row("rqbitDownKbps", t("admin.rqbitDownKbps"), Some(t("admin.rqbitRateHint")), "text", &[], g("rqbitDownKbps"), true),
                    row("rqbitUpKbps", t("admin.rqbitUpKbps"), Some(t("admin.rqbitRateHint")), "text", &[], g("rqbitUpKbps"), true),
                ],
            ),
        ]
        }
        // There is deliberately no "notifications" view: push has no per-server
        // configuration, so it falls through to `_ => Vec::new()`.
        "vpn" => vec![
            group(
                "admin.acqVpn",
                Some("admin.acqVpnDesc"),
                vec![
                    row("vpnKillSwitch", t("admin.vpnKillSwitch"), Some(t("admin.vpnKillSwitchHint")), "toggle", &[], g("vpnKillSwitch"), true),
                    row("vpnCheckUrl", t("admin.vpnCheckUrl"), None, "text", &[], g("vpnCheckUrl"), true),
                    row("acqIndexersUseVpn", t("admin.vpnRouteIndexers"), Some(t("admin.vpnRouteIndexersHint")), "toggle", &[], g("acqIndexersUseVpn"), true),
                ],
            ),
        ],
        _ => Vec::new(),
    }
}

fn row(
    key: &str,
    label: String,
    desc: Option<String>,
    kind: &'static str,
    options: &[&str],
    value: Value,
    applied: bool,
) -> SettingRow {
    SettingRow {
        key: key.to_string(),
        label,
        desc,
        kind,
        options: options.iter().map(ToString::to_string).collect(),
        value,
        applied,
        configured: None,
    }
}

fn transcode_dir(config: &crate::config::Config) -> String {
    config.data_dir.join("hls").to_string_lossy().to_string()
}

fn public_address(config: &crate::config::Config) -> String {
    config
        .web_url
        .clone()
        .unwrap_or_else(|| format!(":{}", config.port))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::TempPool;
    use std::path::PathBuf;

    fn test_pool() -> TempPool {
        crate::db::testing::temp_pool("settings-schema")
    }

    fn test_config() -> crate::config::Config {
        crate::config::Config {
            host: "0.0.0.0".to_string(),
            port: 4040,
            data_dir: PathBuf::from("/data"),
            tmdb_language: "en-US".to_string(),
            ..Default::default()
        }
    }

    fn find_row<'a>(groups: &'a [SettingGroup], key: &str) -> Option<&'a SettingRow> {
        groups.iter().flat_map(|g| &g.rows).find(|r| r.key == key)
    }

    #[test]
    fn general_view_overlays_stored_value_and_version() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        s.set_patch(&pool, std::collections::BTreeMap::from([("serverName".to_string(), json!("MyBox"))]));
        let groups = groups("general", &s, &test_config(), "en");
        assert_eq!(groups.len(), 2);
        assert_eq!(find_row(&groups, "serverName").unwrap().value, json!("MyBox"));
        // Build info is unset in tests, so the row falls back to the crate version.
        let ver = find_row(&groups, "version").unwrap();
        assert_eq!(ver.kind, "value");
        let shown = ver.value.as_str().unwrap();
        assert!(shown.starts_with(env!("CARGO_PKG_VERSION")), "version row: {shown}");
        assert!(shown.contains('('), "version row should include a commit: {shown}");
        let intro = find_row(&groups, "introDetection").unwrap();
        assert_eq!(intro.kind, "select");
        assert_eq!(intro.options, vec!["off", "chapters", "fingerprint"]);
    }

    #[test]
    fn no_view_offers_push_configuration_or_leaks_a_stored_credential() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let p8 = "-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49\n-----END PRIVATE KEY-----";
        s.set_patch(
            &pool,
            std::collections::BTreeMap::from([
                ("notifications.apns.keyP8".to_string(), json!(p8)),
                ("notifications.apns.keyId".to_string(), json!("CC53HSPJDR")),
                ("notifications.apns.teamId".to_string(), json!("TEAM123456")),
                ("notifications.fcm.serviceAccount".to_string(), json!("{\"private_key\":\"x\"}")),
            ]),
        );

        assert!(groups("notifications", &s, &test_config(), "en").is_empty());

        // A credential a fork stored via the API must never come back out of any
        // view, not just the one that used to display them.
        for view in ["notifications", "general", "network", "transcoder", "acquisition", "vpn"] {
            let wire =
                serde_json::to_string(&groups(view, &s, &test_config(), "en")).unwrap();
            for secret in ["BEGIN PRIVATE KEY", "MIGTAgEAMBMGByqGSM49", "CC53HSPJDR", "TEAM123456"]
            {
                assert!(!wire.contains(secret), "{view} view leaked {secret}");
            }
        }
    }

    #[test]
    fn network_view_public_address_from_port_or_web_url() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let groups = groups("network", &s, &test_config(), "en");
        assert_eq!(find_row(&groups, "publicAddress").unwrap().value, json!(":4040"));
        assert_eq!(find_row(&groups, "port").unwrap().value, json!("4040"));
        let mut cfg = test_config();
        cfg.web_url = Some("https://kroma.example.com".to_string());
        let groups = super::groups("network", &s, &cfg, "en");
        assert_eq!(find_row(&groups, "publicAddress").unwrap().value, json!("https://kroma.example.com"));
    }

    #[test]
    fn transcoder_view_transcode_dir() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let groups = groups("transcoder", &s, &test_config(), "en");
        let dir = find_row(&groups, "transcodeDir").unwrap();
        assert_eq!(dir.value, json!("/data/hls"));
        let mc = find_row(&groups, "maxConcurrent").unwrap();
        assert!(mc.options.contains(&"8".to_string()));
    }

    #[test]
    fn acquisition_view_library_options_include_auto() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let mut cfg = test_config();
        cfg.movies_dirs = vec![PathBuf::from("/media/films")];
        let groups = groups("acquisition", &s, &cfg, "en");
        assert_eq!(groups.len(), 3);
        let movie_lib = find_row(&groups, "acqMovieLibrary").unwrap();
        assert_eq!(movie_lib.options.first().map(String::as_str), Some("Auto"));
        assert!(movie_lib.options.contains(&"Films".to_string()));
    }

    #[test]
    fn vpn_view_and_unknown_view() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let cfg = test_config();
        let vpn = groups("vpn", &s, &cfg, "en");
        assert_eq!(vpn.len(), 1);
        assert!(find_row(&vpn, "vpnKillSwitch").is_some());
        assert!(groups("does-not-exist", &s, &cfg, "en").is_empty());
    }

    #[test]
    fn row_builder_shapes_options_and_fields() {
        let r = row("k", "Label".to_string(), Some("d".to_string()), "select", &["a", "b"], json!(1), true);
        assert_eq!(r.key, "k");
        assert_eq!(r.label, "Label");
        assert_eq!(r.desc.as_deref(), Some("d"));
        assert_eq!(r.kind, "select");
        assert_eq!(r.options, vec!["a".to_string(), "b".to_string()]);
        assert!(r.applied);
    }

    #[test]
    fn public_address_and_transcode_dir_helpers() {
        let mut cfg = test_config();
        assert_eq!(public_address(&cfg), ":4040");
        cfg.web_url = Some("https://x.y".to_string());
        assert_eq!(public_address(&cfg), "https://x.y");
        assert_eq!(transcode_dir(&cfg), "/data/hls");
    }
}
