//! The newest version of a module this server runs, read from the registry's
//! full record of it (`GET /m/{id}.json`, RFC 110), for a module whose newest
//! version this server refuses.

use kroma_module_supervisor::Supervisor;
use serde_json::{Map, Value};

use super::parse::{parse_module, REGISTRY_API_VERSION};
use super::{compat_verdict, CatalogModule, Newest};

const PER_VERSION: &[&str] = &[
    "schemaVersion",
    "engines",
    "library",
    "dependencies",
    "optionalDependencies",
    "definesPoints",
    "contributes",
    "consumes",
    "permissions",
    "storage",
    "settings",
    "helpers",
    "artifacts",
];

/// `newest` when this server runs it. Otherwise the newest older version the
/// registry describes that it runs, carrying what `newest` needed; `newest`
/// itself when there is none, or the record cannot be read.
pub(super) async fn runnable(
    sup: &Supervisor,
    index_url: &str,
    entry: &Value,
    newest: CatalogModule,
) -> CatalogModule {
    let Err(refusal) = compat_verdict(&newest) else {
        return newest;
    };
    let Some(url) = record_url(index_url, &newest.id) else {
        return newest;
    };
    let record = match sup.fetch_catalog(&url).await {
        Ok(record) => record,
        Err(e) => {
            tracing::debug!(module = %newest.id, error = %format!("{e:#}"), "no module record to fall back on");
            return newest;
        }
    };
    match newest_runnable(entry, &record, &newest.version) {
        Some(mut older) => {
            older.newest = Some(Newest {
                version: newest.version,
                refusal,
            });
            older
        }
        None => newest,
    }
}

fn is_reverse_dns(id: &str) -> bool {
    let labels: Vec<&str> = id.split('.').collect();
    labels.len() > 1
        && labels.iter().all(|label| {
            !label.is_empty()
                && label
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
}

fn record_url(index_url: &str, id: &str) -> Option<String> {
    if !is_reverse_dns(id) {
        return None;
    }
    kroma_module_supervisor::sibling_url(index_url, &format!("m/{id}.json")).ok()
}

fn newest_runnable(entry: &Value, record: &Value, newest: &str) -> Option<CatalogModule> {
    let api = record.get("apiVersion").and_then(Value::as_u64)?;
    if api > REGISTRY_API_VERSION || record.get("id") != entry.get("id") {
        return None;
    }
    let versions = record.get("versions")?.as_object()?;
    kroma_module_manifest::fallbacks_newest_first(versions.keys().map(String::as_str), newest)
        .into_iter()
        .find_map(|version| {
            let row = parse_module(&version_row(entry, version, versions.get(version)?)?)?;
            compat_verdict(&row).is_ok().then_some(row)
        })
}

fn version_row(entry: &Value, version: &str, described: &Value) -> Option<Value> {
    let mut row: Map<String, Value> = entry.as_object()?.clone();
    for key in PER_VERSION {
        row.remove(*key);
    }
    row.extend(described.as_object()?.clone());
    row.insert("version".into(), Value::String(version.into()));
    Some(Value::Object(row))
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::{newest_runnable, record_url};

    fn version(server: &str) -> Value {
        json!({
            "schemaVersion": 3,
            "engines": { "server": server },
            "artifacts": [{ "target": null, "url": "https://x/older.kmod", "size": 1, "sha256": "aa" }],
        })
    }

    fn entry() -> Value {
        json!({
            "id": "tv.kroma.vpn",
            "name": "VPN",
            "icon": "data:image/svg+xml,x",
            "version": "2.0.0",
            "schemaVersion": 3,
            "engines": { "server": ">=999.0.0" },
            "permissions": { "net": { "connect": ["*"] } },
            "artifacts": [{ "target": null, "url": "https://x/2.kmod", "size": 1, "sha256": "aa" }],
        })
    }

    fn record(versions: Value) -> Value {
        json!({ "apiVersion": 1, "id": "tv.kroma.vpn", "name": "VPN", "latest": "2.0.0", "versions": versions })
    }

    #[test]
    fn the_newest_older_version_this_server_runs_is_picked() {
        let record = record(json!({
            "2.0.0": version(">=999.0.0"),
            "1.2.0": version(">=999.0.0"),
            "1.1.0": version(">=0.0.1"),
            "1.0.0": version(">=0.0.1"),
        }));

        let picked = newest_runnable(&entry(), &record, "2.0.0").unwrap();

        assert_eq!(picked.version, "1.1.0");
    }

    #[test]
    fn the_picked_version_keeps_the_module_identity_and_its_own_declarations() {
        let record = record(json!({ "1.0.0": version(">=0.0.1") }));

        let picked = newest_runnable(&entry(), &record, "2.0.0").unwrap();

        assert_eq!(picked.name, "VPN");
        assert_eq!(picked.icon.as_deref(), Some("data:image/svg+xml,x"));
        assert_eq!(
            picked.engines.get("server").map(String::as_str),
            Some(">=0.0.1")
        );
        assert!(picked.permissions.is_none());
        assert_eq!(picked.artifacts[0].url, "https://x/older.kmod");
    }

    #[test]
    fn a_version_described_by_its_download_alone_is_never_offered() {
        let bare = json!({ "artifacts": [{ "target": null, "url": "https://x/1.kmod", "size": 1, "sha256": "aa" }] });

        let picked = newest_runnable(&entry(), &record(json!({ "1.0.0": bare })), "2.0.0");

        assert!(picked.is_none());
    }

    #[test]
    fn a_record_for_another_module_is_not_read() {
        let mut record = record(json!({ "1.0.0": version(">=0.0.1") }));
        record["id"] = json!("tv.kroma.other");

        assert!(newest_runnable(&entry(), &record, "2.0.0").is_none());
    }

    #[test]
    fn a_record_in_a_registry_contract_this_server_does_not_speak_is_not_read() {
        let mut record = record(json!({ "1.0.0": version(">=0.0.1") }));
        record["apiVersion"] = json!(2);

        assert!(newest_runnable(&entry(), &record, "2.0.0").is_none());
    }

    #[test]
    fn a_record_is_looked_up_beside_the_index_it_came_from() {
        let url = record_url("https://modules.kroma.tv/index.json", "tv.kroma.vpn");

        assert_eq!(
            url.as_deref(),
            Some("https://modules.kroma.tv/m/tv.kroma.vpn.json")
        );
    }

    #[test]
    fn an_id_that_is_not_reverse_dns_never_becomes_a_path() {
        let index = "https://modules.kroma.tv/index.json";

        let urls = ["../secrets", "tv.kroma/../x", "nodots", "Tv.Kroma.Vpn"]
            .map(|id| record_url(index, id));

        assert_eq!(urls, [None, None, None, None]);
    }
}
