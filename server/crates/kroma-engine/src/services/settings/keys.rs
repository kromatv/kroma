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
/// than served. An identity the server mints for itself is declared
/// [`SettingReach::CoreOnly`], and the next key someone adds without thinking
/// about who reads it is withheld either way.
pub fn reach_of_setting(key: &str) -> SettingReach {
    static REACH: OnceLock<BTreeMap<&'static str, SettingReach>> = OnceLock::new();
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

    fn public(&mut self, key: &'static str, value: Value) {
        self.declare(key, SettingReach::Any, value);
    }

    fn core_only(&mut self, key: &'static str, value: Value) {
        self.declare(key, SettingReach::CoreOnly, value);
    }

    fn sidecar_credential(&mut self, key: &'static str, value: Value) {
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
    m.public("serverName", json!("KROMA"));
    m.minted("instanceId");
    // One key for the whole blob: `{ "<id>": { "enabled": bool, "config": {..} } }`.
    // A module reads its own config out of the point call that carries it, never
    // out of here, so the blob holding every other module's stays the core's.
    m.core_only("moduleStates", json!({}));
    // Empty = the built-in catalog (modules.json on this repo's GitHub Releases).
    // This is the OFFICIAL slot: it stays pinned first and wins on an id clash.
    m.core_only("moduleRegistryUrl", json!(""));
    // Operator-added registries beyond the official one, as
    // `[{ "name": str, "url": str, "enabled": bool }]`. Validated on read (see
    // api/admin/store/registries.rs): the list is operator input pointing at
    // third-party catalogs of native code.
    m.core_only("moduleRegistries", json!([]));
    m.public("uiLanguage", json!("Français"));
    // Empty → the env-configured `KROMA_TMDB_LANGUAGE` (default "en-US").
    m.public("tmdbLanguage", json!(super::TMDB_LANGUAGE_AUTO));
    m.public("timezone", json!("Europe/Zurich (UTC+1)"));
    m.public("autoUpdate", json!(true));
    m.public("updateChannel", json!("Stable"));
    // Periodic re-scan cadence, the only path that catches NAS/SMB edits (they
    // emit no FS events). `-1` = `KROMA_WATCH_INTERVAL` or 300s, `0` = FS events only.
    m.public("watchAutoScan", json!(true));
    m.public("watchIntervalSecs", json!(-1));
    // On, and an operator turns it off in Admin -> General -> Privacy. What it
    // sends, and why this is legitimate interest rather than consent, is
    // docs/anonymous-stats-gdpr.md. The two below are the detail blocks the base
    // switch carries, each droppable on its own and each silent without it.
    m.public("anonStats", json!(true));
    m.public("anonStatsUsage", json!(true));
    m.public("anonStatsStatistics", json!(true));
    m.minted("statsId");
    m.minted("stats.lastSentAt");
    m.public("showRecentHome", json!(true));
    // Security: exposes the account roster on the login screen. Off by default so
    // knowing the server URL does not reveal who has an account; when off,
    // `GET /api/users` returns an empty list.
    m.public("publicUserList", json!(false));
    m.public("themeSongs", json!(false));
    // off | chapters (free, from embedded chapters) | fingerprint (heavy audio job).
    m.public("introDetection", json!("chapters"));
    m.public("theme", json!("Sombre (Kroma)"));
    m.public("dateFormat", json!("JJ/MM/AAAA"));
    m.public("moduleAutoUpdate", json!(true));
    m.public("remoteAccess", json!(false));
    m.public("remoteUrl", json!(""));
    // Cloudflare Tunnel token for the `cloudflared` child the remote-access
    // sidecar supervises. Never returned to clients.
    m.sidecar_credential("remoteAccessToken", json!(""));
    m.public("upLimit", json!("Illimité"));
    m.public("https", json!("Préférées"));
    // Self-signed HTTPS listener: browsers only expose Web Crypto (passkeys) on a
    // secure origin. Applied at boot, so a change needs a restart; `KROMA_HTTPS` /
    // `KROMA_HTTPS_PORT` override the stored values. See src/tls.rs.
    m.public("httpsEnabled", json!(false));
    m.public("httpsPort", json!("4443"));
    m.public("httpsRedirect", json!(false));
    m.public("ipv6", json!(false));
    m.public("localDiscovery", json!(true));
    m.public(
        "localNetworks",
        json!("192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12"),
    );
    m.public("hwAccel", json!(false));
    m.public("hwDevice", json!("Auto"));
    m.public("hevcEncode", json!(false));
    m.public("transcoderSpeed", json!("Automatique"));
    m.public("bgQuality", json!("Préférer la vitesse"));
    m.public("maxConcurrent", json!("8"));
    // Concurrent CPU-heavy background ffmpeg passes; "0" = auto (cores - 1).
    m.public("mediaConcurrency", json!("0"));
    m.public("pipelinePaused", json!(false));
    m.public("deleteAfter", json!(true));
    m.public("cacheLimit", json!("80 Go"));
    m.public("transcodeCacheLimit", json!("20 Go"));
    // Scheduler timezone offset in minutes from UTC (60 = UTC+1, -300 = UTC-5).
    m.public("jobsUtcOffset", json!(0));
    // Keyword lists are comma-separated, matched as whole tokens against release names.
    m.public("acqEnabled", json!(false));
    m.public("acqAutoApprove", json!(false));
    m.public("acqDeleteAfterImport", json!(false));
    m.public("acqReplaceOnUpgrade", json!(true));
    m.public("acqResolution", json!("1080p"));
    m.public("acqPreferHevc", json!(true));
    m.public("acqMinSeeders", json!(2));
    m.public("acqMaxSizeGbMovie", json!(15));
    m.public("acqMaxSizeGbEpisode", json!(3));
    m.public("acqRequiredKeywords", json!(""));
    m.public(
        "acqForbiddenKeywords",
        json!("cam, hdcam, ts, telesync, telecine, screener, dvdscr, workprint"),
    );
    // Embedded torrent engine knobs (0 = ephemeral port / unlimited rate).
    m.public("rqbitPort", json!(0));
    m.public("rqbitDownKbps", json!(0));
    m.public("rqbitUpKbps", json!(0));
    // How many downloads may hold an engine slot at once (0 = no cap); the rest
    // wait in the queue.
    m.public("torrentMaxActive", json!(0));
    // The WireGuard tunnel the bridge sidecar brings up. Never returned in a
    // settings view.
    m.sidecar_credential("vpnWgConfig", json!(""));
    m.public("vpnLocalPort", json!(25345));
    m.public("vpnKillSwitch", json!(false));
    m.public("vpnCheckUrl", json!("https://api.ipify.org"));
    // Library new downloads land in, by name; "Auto" = first of the matching kind.
    m.public("acqMovieLibrary", json!("Auto"));
    m.public("acqSeriesLibrary", json!("Auto"));
    // Sonarr/Radarr-style tokens; see kroma_torrent::organize::naming.
    m.public("namingMovieFolder", json!("{Title} ({Year})"));
    m.public("namingMovieFile", json!("{Title} ({Year}) {Quality Full}"));
    m.public("namingSeriesFolder", json!("{Title} ({Year})"));
    m.public("namingSeasonFolder", json!("Season {season:00}"));
    m.public(
        "namingEpisodeFile",
        json!("{Title} - S{season:00}E{episode:00} - {Episode Title} {Quality Full}"),
    );
    // MUST stay registered: `set_patch` silently drops unknown keys, so without
    // this line `save_naming` answers `{"ok": true}` and throws the value away.
    m.public("namingCase", json!("default"));
    // openai = any OpenAI-compatible server (Ollama, llama.cpp, LM Studio, …);
    // anthropic = Claude.
    m.public("llmEnabled", json!(true));
    m.public("llmProvider", json!("openai"));
    m.public("llmBaseUrl", json!(""));
    m.public("llmModel", json!(""));
    m.core_only("llmApiKey", json!(""));
    m.public("llmTemperature", json!(0.7));
    m.public("llmMaxTokens", json!(900));
    m.public("llmReasoning", json!(false));
    // Seeded from the flat `llm*` keys above on first read when empty.
    m.public("llmProviders", json!([]));
    m.public("llmDefaultProvider", json!(""));
    m.public("libraries", json!(null));
    // ISO-8601 `items.added_at` the digest has reported up to. Empty = never run:
    // the first pass adopts the current library as its baseline and stays silent.
    m.public("notifications.digest.since", json!(""));
    // Web Push (RFC 8292) VAPID identity, minted on the first subscription and
    // then left alone: rotating it invalidates every subscribed browser.
    m.public("notifications.vapid.publicKey", json!(""));
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
    // first boot, and the core's alone: a sidecar holding it forges a ticket for
    // any device and reads any library.
    m.core_only("mediaTicketKey", json!(""));
    // Operator SMTP for credential-reset email.
    m.public("smtpEnabled", json!(false));
    m.public("smtpHost", json!(""));
    m.public("smtpPort", json!(587));
    m.public("smtpUsername", json!(""));
    m.public("smtpFrom", json!(""));
    m.core_only("smtpPassword", json!(""));
    m
}
