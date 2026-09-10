//! The built-in settings keys: every default value, and which of them the core
//! keeps to itself.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

use serde_json::{json, Value};

#[cfg(test)]
mod tests;

/// Whether `key` is the core's alone: a credential only the core consumes, or the
/// registry list that decides where installable native code comes from. The
/// module host callback neither reads nor writes one, so a sidecar that asks for
/// it gets the default it asked with.
pub fn core_only(key: &str) -> bool {
    static CORE_ONLY: OnceLock<BTreeSet<&'static str>> = OnceLock::new();
    CORE_ONLY
        .get_or_init(|| {
            declared()
                .reach
                .into_iter()
                .filter(|(_, reach)| *reach == Reach::CoreOnly)
                .map(|(key, _)| key)
                .collect()
        })
        .contains(key)
}

pub(super) fn defaults() -> BTreeMap<String, Value> {
    declared().values
}

#[derive(PartialEq, Eq)]
enum Reach {
    CoreOnly,
    Sidecar,
}

struct Declared {
    values: BTreeMap<String, Value>,
    reach: BTreeMap<&'static str, Reach>,
}

impl Declared {
    fn new() -> Self {
        Declared {
            values: BTreeMap::new(),
            reach: BTreeMap::new(),
        }
    }

    fn insert(&mut self, key: String, value: Value) {
        self.values.insert(key, value);
    }

    fn core_only(&mut self, key: &'static str, value: Value) {
        self.reach.insert(key, Reach::CoreOnly);
        self.values.insert(key.to_string(), value);
    }

    fn sidecar_credential(&mut self, key: &'static str, value: Value) {
        self.reach.insert(key, Reach::Sidecar);
        self.values.insert(key.to_string(), value);
    }
}

fn declared() -> Declared {
    let mut m = Declared::new();
    m.insert("serverName".into(), json!("KROMA"));
    // One key for the whole blob: `{ "<id>": { "enabled": bool, "config": {..} } }`
    // (module ids are not known at compile time, so they can't be allow-listed).
    m.insert("moduleStates".into(), json!({}));
    // Empty = the built-in catalog (modules.json on this repo's GitHub Releases).
    // This is the OFFICIAL slot: it stays pinned first and wins on an id clash.
    m.core_only("moduleRegistryUrl", json!(""));
    // Operator-added registries beyond the official one, as
    // `[{ "name": str, "url": str, "enabled": bool }]`. Validated on read (see
    // api/admin/store/registries.rs): the list is operator input pointing at
    // third-party catalogs of native code.
    m.core_only("moduleRegistries", json!([]));
    m.insert("uiLanguage".into(), json!("Français"));
    // Empty → the env-configured `KROMA_TMDB_LANGUAGE` (default "en-US").
    m.insert("tmdbLanguage".into(), json!(super::TMDB_LANGUAGE_AUTO));
    m.insert("timezone".into(), json!("Europe/Zurich (UTC+1)"));
    m.insert("autoUpdate".into(), json!(true));
    m.insert("updateChannel".into(), json!("Stable"));
    // Periodic re-scan cadence, the only path that catches NAS/SMB edits (they
    // emit no FS events). `-1` = `KROMA_WATCH_INTERVAL` or 300s, `0` = FS events only.
    m.insert("watchAutoScan".into(), json!(true));
    m.insert("watchIntervalSecs".into(), json!(-1));
    // On, and an operator turns it off in Admin -> General -> Privacy. What it
    // sends, and why this is legitimate interest rather than consent, is
    // docs/anonymous-stats-gdpr.md. The two below are the detail blocks the base
    // switch carries, each droppable on its own and each silent without it.
    m.insert("anonStats".into(), json!(true));
    m.insert("anonStatsUsage".into(), json!(true));
    m.insert("anonStatsStatistics".into(), json!(true));
    m.insert("showRecentHome".into(), json!(true));
    // Security: exposes the account roster on the login screen. Off by default so
    // knowing the server URL does not reveal who has an account; when off,
    // `GET /api/users` returns an empty list.
    m.insert("publicUserList".into(), json!(false));
    m.insert("themeSongs".into(), json!(false));
    // off | chapters (free, from embedded chapters) | fingerprint (heavy audio job).
    m.insert("introDetection".into(), json!("chapters"));
    m.insert("theme".into(), json!("Sombre (Kroma)"));
    m.insert("dateFormat".into(), json!("JJ/MM/AAAA"));
    m.insert("moduleAutoUpdate".into(), json!(true));
    m.insert("remoteAccess".into(), json!(false));
    m.insert("remoteUrl".into(), json!(""));
    // Cloudflare Tunnel token for the `cloudflared` child the remote-access
    // sidecar supervises. Never returned to clients.
    m.sidecar_credential("remoteAccessToken", json!(""));
    m.insert("upLimit".into(), json!("Illimité"));
    m.insert("https".into(), json!("Préférées"));
    // Self-signed HTTPS listener: browsers only expose Web Crypto (passkeys) on a
    // secure origin. Applied at boot, so a change needs a restart; `KROMA_HTTPS` /
    // `KROMA_HTTPS_PORT` override the stored values. See src/tls.rs.
    m.insert("httpsEnabled".into(), json!(false));
    m.insert("httpsPort".into(), json!("4443"));
    m.insert("httpsRedirect".into(), json!(false));
    m.insert("ipv6".into(), json!(false));
    m.insert("localDiscovery".into(), json!(true));
    m.insert(
        "localNetworks".into(),
        json!("192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12"),
    );
    m.insert("hwAccel".into(), json!(false));
    m.insert("hwDevice".into(), json!("Auto"));
    m.insert("hevcEncode".into(), json!(false));
    m.insert("transcoderSpeed".into(), json!("Automatique"));
    m.insert("bgQuality".into(), json!("Préférer la vitesse"));
    m.insert("maxConcurrent".into(), json!("8"));
    // Concurrent CPU-heavy background ffmpeg passes; "0" = auto (cores - 1).
    m.insert("mediaConcurrency".into(), json!("0"));
    m.insert("pipelinePaused".into(), json!(false));
    m.insert("deleteAfter".into(), json!(true));
    m.insert("cacheLimit".into(), json!("80 Go"));
    m.insert("transcodeCacheLimit".into(), json!("20 Go"));
    // Scheduler timezone offset in minutes from UTC (60 = UTC+1, -300 = UTC-5).
    m.insert("jobsUtcOffset".into(), json!(0));
    // Keyword lists are comma-separated, matched as whole tokens against release names.
    m.insert("acqEnabled".into(), json!(false));
    m.insert("acqAutoApprove".into(), json!(false));
    m.insert("acqDeleteAfterImport".into(), json!(false));
    m.insert("acqReplaceOnUpgrade".into(), json!(true));
    m.insert("acqResolution".into(), json!("1080p"));
    m.insert("acqPreferHevc".into(), json!(true));
    m.insert("acqMinSeeders".into(), json!(2));
    m.insert("acqMaxSizeGbMovie".into(), json!(15));
    m.insert("acqMaxSizeGbEpisode".into(), json!(3));
    m.insert("acqRequiredKeywords".into(), json!(""));
    m.insert(
        "acqForbiddenKeywords".into(),
        json!("cam, hdcam, ts, telesync, telecine, screener, dvdscr, workprint"),
    );
    // Embedded torrent engine knobs (0 = ephemeral port / unlimited rate).
    m.insert("rqbitPort".into(), json!(0));
    m.insert("rqbitDownKbps".into(), json!(0));
    m.insert("rqbitUpKbps".into(), json!(0));
    // How many downloads may hold an engine slot at once (0 = no cap); the rest
    // wait in the queue.
    m.insert("torrentMaxActive".into(), json!(0));
    // The WireGuard tunnel the bridge sidecar brings up. Never returned in a
    // settings view.
    m.sidecar_credential("vpnWgConfig", json!(""));
    m.insert("vpnLocalPort".into(), json!(25345));
    m.insert("vpnKillSwitch".into(), json!(false));
    m.insert("vpnCheckUrl".into(), json!("https://api.ipify.org"));
    // Library new downloads land in, by name; "Auto" = first of the matching kind.
    m.insert("acqMovieLibrary".into(), json!("Auto"));
    m.insert("acqSeriesLibrary".into(), json!("Auto"));
    // Sonarr/Radarr-style tokens; see kroma_torrent::organize::naming.
    m.insert("namingMovieFolder".into(), json!("{Title} ({Year})"));
    m.insert(
        "namingMovieFile".into(),
        json!("{Title} ({Year}) {Quality Full}"),
    );
    m.insert("namingSeriesFolder".into(), json!("{Title} ({Year})"));
    m.insert("namingSeasonFolder".into(), json!("Season {season:00}"));
    m.insert(
        "namingEpisodeFile".into(),
        json!("{Title} - S{season:00}E{episode:00} - {Episode Title} {Quality Full}"),
    );
    // MUST stay registered: `set_patch` silently drops unknown keys, so without
    // this line `save_naming` answers `{"ok": true}` and throws the value away.
    m.insert("namingCase".into(), json!("default"));
    // openai = any OpenAI-compatible server (Ollama, llama.cpp, LM Studio, …);
    // anthropic = Claude.
    m.insert("llmEnabled".into(), json!(true));
    m.insert("llmProvider".into(), json!("openai"));
    m.insert("llmBaseUrl".into(), json!(""));
    m.insert("llmModel".into(), json!(""));
    m.core_only("llmApiKey", json!(""));
    m.insert("llmTemperature".into(), json!(0.7));
    m.insert("llmMaxTokens".into(), json!(900));
    m.insert("llmReasoning".into(), json!(false));
    // Seeded from the flat `llm*` keys above on first read when empty.
    m.insert("llmProviders".into(), json!([]));
    m.insert("llmDefaultProvider".into(), json!(""));
    m.insert("libraries".into(), json!(null));
    // ISO-8601 `items.added_at` the digest has reported up to. Empty = never run:
    // the first pass adopts the current library as its baseline and stays silent.
    m.insert("notifications.digest.since".into(), json!(""));
    // Web Push (RFC 8292) VAPID identity, minted on the first subscription and
    // then left alone: rotating it invalidates every subscribed browser.
    m.insert("notifications.vapid.publicKey".into(), json!(""));
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
    m.insert("smtpEnabled".into(), json!(false));
    m.insert("smtpHost".into(), json!(""));
    m.insert("smtpPort".into(), json!(587));
    m.insert("smtpUsername".into(), json!(""));
    m.insert("smtpFrom".into(), json!(""));
    m.core_only("smtpPassword", json!(""));
    m
}
