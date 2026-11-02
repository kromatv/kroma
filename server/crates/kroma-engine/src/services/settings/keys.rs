//! The built-in settings keys: every default value, and who may reach each one.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use kroma_module_host::SettingReach;
use serde_json::{json, Value};

#[cfg(test)]
mod tests;

/// How far `key` reaches out of the core, for the module host callback to apply.
///
/// Withheld unless a declaration in this module hands the key out, so a key that
/// reaches the store with no declared reach is [`SettingReach::Unknown`] rather
/// than served.
pub fn reach_of_setting(key: &str) -> SettingReach {
    static REACH: OnceLock<BTreeMap<&str, SettingReach>> = OnceLock::new();
    *REACH
        .get_or_init(|| declared().reach)
        .get(key)
        .unwrap_or(&SettingReach::Unknown)
}

pub(super) fn defaults() -> BTreeMap<String, Value> {
    declared().values
}

struct Declared {
    values: BTreeMap<String, Value>,
    reach: BTreeMap<&'static str, SettingReach>,
}

impl Declared {
    fn new() -> Self {
        Declared {
            values: BTreeMap::new(),
            reach: BTreeMap::new(),
        }
    }

    fn core_only(&mut self, key: &'static str, value: Value) {
        self.declare(key, SettingReach::CoreOnly, value);
    }

    fn module_declared(&mut self, key: &'static str, value: Value) {
        self.declare(key, SettingReach::Declared, value);
    }

    fn minted(&mut self, key: &'static str) {
        self.reach.insert(key, SettingReach::CoreOnly);
    }

    fn declare(&mut self, key: &'static str, reach: SettingReach, value: Value) {
        self.reach.insert(key, reach);
        self.values.insert(key.to_string(), value);
    }
}

fn declared() -> Declared {
    let mut m = Declared::new();
    m.module_declared("serverName", json!("KROMA"));
    m.minted("instanceId");
    // One key for the whole blob: `{ "<id>": { "enabled": bool, "config": {..} } }`.
    m.core_only("moduleStates", json!({}));
    // Empty = the built-in catalog (modules.json on this repo's GitHub Releases).
    // This is the OFFICIAL slot: it stays pinned first and wins on an id clash.
    m.core_only("moduleRegistryUrl", json!(""));
    // Operator-added registries beyond the official one, as
    // `[{ "name": str, "url": str, "enabled": bool }]`. Validated on read (see
    // api/admin/store/registries.rs): the list is operator input pointing at
    // third-party catalogs of native code.
    m.core_only("moduleRegistries", json!([]));
    m.module_declared("uiLanguage", json!("Français"));
    // Empty → the env-configured `KROMA_TMDB_LANGUAGE` (default "en-US").
    m.module_declared("tmdbLanguage", json!(super::TMDB_LANGUAGE_AUTO));
    m.module_declared("timezone", json!("Europe/Zurich (UTC+1)"));
    m.module_declared("autoUpdate", json!(true));
    m.module_declared("autoInstallUpdates", json!(null));
    m.module_declared("updateChannel", json!(null));
    // Periodic re-scan cadence, the only path that catches NAS/SMB edits (they
    // emit no FS events). `-1` = `KROMA_WATCH_INTERVAL` or 300s, `0` = FS events only.
    m.module_declared("watchAutoScan", json!(true));
    m.module_declared("watchIntervalSecs", json!(-1));
    // On, and an operator turns it off in Admin -> General -> Privacy. What it
    // sends, and why this is legitimate interest rather than consent, is
    // docs/anonymous-stats-gdpr.md. The two below are the detail blocks the base
    // switch carries, each droppable on its own and each silent without it.
    m.module_declared("anonStats", json!(true));
    m.module_declared("anonStatsUsage", json!(true));
    m.module_declared("anonStatsStatistics", json!(true));
    m.minted("statsId");
    m.minted("stats.lastSentAt");
    m.minted("update.status");
    m.minted("update.operation");
    m.minted(crate::services::network::SETTING_KEY);
    m.module_declared("showRecentHome", json!(true));
    // Security: exposes the account roster on the login screen. Off by default so
    // knowing the server URL does not reveal who has an account; when off,
    // `GET /api/users` returns an empty list.
    m.module_declared("publicUserList", json!(false));
    m.module_declared("themeSongs", json!(false));
    // off | chapters (free, from embedded chapters) | fingerprint (heavy audio job).
    m.module_declared("introDetection", json!("chapters"));
    m.module_declared(
        "playedThreshold",
        json!(kroma_domain::DEFAULT_PLAYED_PERCENT.to_string()),
    );
    m.module_declared("theme", json!("Sombre (Kroma)"));
    m.module_declared("dateFormat", json!("JJ/MM/AAAA"));
    m.module_declared("moduleAutoUpdate", json!(true));
    m.module_declared("remoteAccess", json!(false));
    m.module_declared("remoteUrl", json!(""));
    // Cloudflare Tunnel token for the `cloudflared` child the remote-access
    // module supervises. Never returned to clients.
    m.module_declared("remoteAccessToken", json!(""));
    m.module_declared("upLimit", json!("Illimité"));
    m.module_declared("https", json!("Préférées"));
    // Self-signed HTTPS listener: browsers only expose Web Crypto (passkeys) on a
    // secure origin. Applied at boot, so a change needs a restart; `KROMA_HTTPS` /
    // `KROMA_HTTPS_PORT` override the stored values. See src/tls.rs.
    m.module_declared("httpsEnabled", json!(false));
    m.module_declared("httpsPort", json!("4443"));
    m.module_declared("httpsRedirect", json!(false));
    m.module_declared("ipv6", json!(false));
    m.module_declared("localDiscovery", json!(true));
    m.module_declared(
        "localNetworks",
        json!("192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12"),
    );
    m.module_declared("hwAccel", json!(false));
    m.module_declared("hwDevice", json!("Auto"));
    m.module_declared("hevcEncode", json!(false));
    m.module_declared("transcoderSpeed", json!("Automatique"));
    m.module_declared("bgQuality", json!("Préférer la vitesse"));
    m.module_declared("maxConcurrent", json!("8"));
    // Concurrent CPU-heavy background ffmpeg passes; "0" = auto (cores - 1).
    m.module_declared("mediaConcurrency", json!("0"));
    m.module_declared("pipelinePaused", json!(false));
    m.module_declared("deleteAfter", json!(true));
    m.module_declared("cacheLimit", json!("80 Go"));
    m.module_declared("transcodeCacheLimit", json!("20 Go"));
    // Scheduler timezone offset in minutes from UTC (60 = UTC+1, -300 = UTC-5).
    m.module_declared("jobsUtcOffset", json!(0));
    m.module_declared("acqIndexersUseVpn", json!(false));
    m.module_declared("acqFlaresolverrUrl", json!(""));
    m.module_declared("acqEnabled", json!(false));
    m.module_declared("acqAutoApprove", json!(false));
    m.module_declared("acqDeleteAfterImport", json!(false));
    m.module_declared("acqReplaceOnUpgrade", json!(true));
    // A file an upgrade replaces moves here instead of being deleted ("" =
    // delete at once), and is cleared after `acqRecycleDays`.
    m.module_declared("acqRecycleBin", json!(""));
    // Folders an external download client saves into, comma or line separated.
    m.core_only("downloadFolders", json!(""));
    m.module_declared("acqRecycleDays", json!(30));
    // A download still unfinished this many hours after its grab has failed
    // (0 = never).
    m.module_declared("acqStallHours", json!(72));
    // How often the indexers' latest releases are read for monitored titles,
    // in minutes (0 = never).
    m.module_declared("acqRssMinutes", json!(15));
    m.module_declared("acqResolution", json!("1080p"));
    m.module_declared("acqPreferHevc", json!(true));
    m.module_declared("acqMinSeeders", json!(2));
    m.module_declared("acqMaxSizeGbMovie", json!(15));
    m.module_declared("acqMaxSizeGbEpisode", json!(3));
    m.module_declared("acqRequiredKeywords", json!(""));
    m.module_declared(
        "acqForbiddenKeywords",
        json!("cam, hdcam, ts, telesync, telecine, screener, dvdscr, workprint"),
    );
    // Embedded torrent engine knobs (0 = ephemeral port / unlimited rate).
    m.module_declared("rqbitPort", json!(0));
    m.module_declared("rqbitDownKbps", json!(0));
    m.module_declared("rqbitUpKbps", json!(0));
    // How many downloads may hold an engine slot at once (0 = no cap); the rest
    // wait in the queue.
    m.module_declared("torrentMaxActive", json!(0));
    // The WireGuard tunnel the VPN module brings up. Never returned in a
    // settings view.
    m.module_declared("vpnWgConfig", json!(""));
    m.module_declared("vpnLocalPort", json!(25345));
    m.module_declared("vpnKillSwitch", json!(false));
    m.module_declared("vpnCheckUrl", json!("https://api.ipify.org"));
    // Library new downloads land in, by name; "Auto" = first of the matching kind.
    m.module_declared("acqMovieLibrary", json!("Auto"));
    m.module_declared("acqSeriesLibrary", json!("Auto"));
    // Sonarr/Radarr-style tokens; see kroma_torrent::organize::naming.
    m.module_declared("namingMovieFolder", json!("{Title} ({Year})"));
    m.module_declared("namingMovieFile", json!("{Title} ({Year}) {Quality Full}"));
    m.module_declared("namingSeriesFolder", json!("{Title} ({Year})"));
    m.module_declared("namingSeasonFolder", json!("Season {season:00}"));
    m.module_declared(
        "namingEpisodeFile",
        json!("{Title} - S{season:00}E{episode:00} - {Episode Title} {Quality Full}"),
    );
    m.module_declared("namingCase", json!("default"));
    // openai = any OpenAI-compatible server (Ollama, llama.cpp, LM Studio, …);
    // anthropic = Claude.
    m.module_declared("llmEnabled", json!(true));
    m.module_declared("llmProvider", json!("openai"));
    m.module_declared("llmBaseUrl", json!(""));
    m.module_declared("llmModel", json!(""));
    m.core_only("llmApiKey", json!(""));
    m.module_declared("llmTemperature", json!(0.7));
    m.module_declared("llmMaxTokens", json!(900));
    m.module_declared("llmReasoning", json!(false));
    // Seeded from the flat `llm*` keys above on first read when empty.
    m.module_declared("llmProviders", json!([]));
    m.module_declared("llmDefaultProvider", json!(""));
    m.core_only("libraries", json!(null));
    // ISO-8601 `items.added_at` the digest has reported up to. Empty = never run:
    // the first pass adopts the current library as its baseline and stays silent.
    m.module_declared("notifications.digest.since", json!(""));
    // Web Push (RFC 8292) VAPID identity, minted on the first subscription and
    // then left alone: rotating it invalidates every subscribed browser.
    m.module_declared("notifications.vapid.publicKey", json!(""));
    m.core_only("notifications.vapid.privateKey", json!(""));
    // Apple/Google only accept keys they issued to whoever PUBLISHES the app, so
    // these normally arrive with the build (`KROMA_APNS_*` /
    // `KROMA_FCM_SERVICE_ACCOUNT`); the rows are the fallback for a fork shipping
    // its own app. Empty = that platform's push stays off.
    m.core_only("notifications.apns.keyP8", json!(""));
    m.core_only("notifications.apns.keyId", json!(""));
    m.core_only("notifications.apns.teamId", json!(""));
    m.core_only("notifications.fcm.serviceAccount", json!(""));
    // Signs the media tickets the byte routes accept in a URL (ACCT-35). Minted on
    // first boot, and the core's alone: a module holding it forges a ticket for
    // any device and reads any library.
    m.core_only("mediaTicketKey", json!(""));
    // How account email leaves: `manual` | `smtp` | `relay`. Empty defers to the
    // older `smtpEnabled` toggle (see `email_delivery`).
    m.module_declared("emailDelivery", json!(""));
    // This server at the mail relay: the P-256 key that signs every call, the
    // sealed instance the relay answered with, and the origin it was minted
    // for. Minted and written by the server itself; a module never sees them.
    m.core_only("mailRelay.identityKey", json!(""));
    m.core_only("mailRelay.instance", json!(""));
    m.core_only("mailRelay.instanceOrigin", json!(""));
    m.module_declared("smtpEnabled", json!(false));
    m.module_declared("smtpHost", json!(""));
    m.module_declared("smtpPort", json!(587));
    m.module_declared("smtpUsername", json!(""));
    m.module_declared("smtpFrom", json!(""));
    m.core_only("smtpPassword", json!(""));
    m
}
