//! What this server can do that a client draws a surface for: which capability
//! names a viewer may be offered, where each one is answered, and the module's
//! own description of itself forwarded whole.

use std::collections::BTreeMap;

use kroma_domain::{Permission, User};
use kroma_module_host::Contribution;
use serde::Serialize;
use serde_json::{json, Map, Value};

const DRAWN_BY_A_CLIENT: [(&str, Permission); 1] = [("watchable", Permission::WatchablePlay)];

const DESCRIBE_SECS: u32 = 3;

/// Where one capability is answered. `mount` names the lowest-id module
/// answering it, which is what a client written before `sources` existed reads.
#[derive(Debug, PartialEq, Serialize)]
pub struct Capability {
    pub mount: String,
    pub sources: Vec<Value>,
}

pub type Offered = BTreeMap<&'static str, Capability>;

/// Every capability `viewer` holds the right for, described in `locale`.
///
/// A source whose module did not answer is left out rather than forwarded as a
/// bare mount.
pub async fn offered(
    resolve: impl Fn(&str) -> Vec<Contribution>,
    viewer: &User,
    locale: &str,
) -> Offered {
    let answering: Vec<(&'static str, Vec<Contribution>)> = DRAWN_BY_A_CLIENT
        .iter()
        .filter(|(_, granted)| viewer.can(*granted))
        .map(|(point, _)| (*point, in_a_stable_order(resolve(point))))
        .collect();
    let locale = locale.to_string();
    tokio::task::spawn_blocking(move || collect(answering, &locale))
        .await
        .unwrap_or_default()
}

fn in_a_stable_order(mut contributions: Vec<Contribution>) -> Vec<Contribution> {
    contributions.sort_by(|a, b| (&a.module_id, &a.instance).cmp(&(&b.module_id, &b.instance)));
    contributions
}

fn collect(answering: Vec<(&'static str, Vec<Contribution>)>, locale: &str) -> Offered {
    answering
        .into_iter()
        .filter_map(|(point, contributions)| {
            Some((point, capability(point, &contributions, locale)?))
        })
        .collect()
}

fn capability(point: &str, contributions: &[Contribution], locale: &str) -> Option<Capability> {
    Some(Capability {
        mount: mount(contributions.first()?),
        sources: contributions
            .iter()
            .filter_map(|answering| source(point, answering, locale))
            .collect(),
    })
}

fn source(point: &str, answering: &Contribution, locale: &str) -> Option<Value> {
    let mut declared = described(point, answering, locale)?;
    declared.insert("mount".into(), Value::String(mount(answering)));
    Some(Value::Object(declared))
}

fn described(point: &str, answering: &Contribution, locale: &str) -> Option<Map<String, Value>> {
    let answer: Value = kroma_module_host::call_raw_within(
        &answering.resolver(),
        &format!("{point}/describe"),
        &json!({ "locale": locale }),
        DESCRIBE_SECS,
    )
    .ok()?;
    match answer {
        Value::Object(declared) => Some(declared),
        _ => None,
    }
}

fn mount(answering: &Contribution) -> String {
    format!("/api/module/{}", answering.module_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn answering(module_id: &str, instance: Option<&str>) -> Contribution {
        Contribution {
            module_id: module_id.into(),
            instance: instance.map(str::to_string),
            base_url: "http://127.0.0.1:1".into(),
            token: "t".into(),
        }
    }

    #[test]
    fn sources_are_ordered_by_the_module_answering_rather_than_by_what_the_disk_listed() {
        let listed = vec![
            answering("tv.kroma.usenet", None),
            answering("tv.kroma.torrents", Some("rqbit")),
            answering("tv.kroma.torrents", None),
        ];

        let ordered = in_a_stable_order(listed);

        assert_eq!(
            ordered
                .iter()
                .map(|c| (c.module_id.as_str(), c.instance.as_deref()))
                .collect::<Vec<_>>(),
            [
                ("tv.kroma.torrents", None),
                ("tv.kroma.torrents", Some("rqbit")),
                ("tv.kroma.usenet", None),
            ]
        );
    }

    #[test]
    fn a_module_that_cannot_be_reached_is_left_out_rather_than_listed_as_a_bare_mount() {
        let unreachable = [answering("tv.kroma.torrents", None)];

        let offered =
            capability("watchable", &unreachable, "en").expect("the mount is still known");

        assert_eq!(offered.mount, "/api/module/tv.kroma.torrents");
        assert_eq!(offered.sources, Vec::<Value>::new());
    }

    #[test]
    fn a_capability_nothing_answers_has_no_mount_to_offer() {
        assert!(capability("watchable", &[], "en").is_none());
    }
}
