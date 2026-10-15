use axum::Router;

use kroma_module_sdk::capability::{routes as describe_routes, FigureKind, Source};

use crate::strings;

pub const WATCHABLE: &str = "watchable";

pub fn routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    describe_routes(WATCHABLE, describe)
}

fn describe(locale: &str) -> Source {
    let t = strings::for_locale(locale);
    Source::new(t.t("watch.label", &[]), "magnet")
        .figure(
            "downloaded",
            t.t("watch.downloaded", &[]),
            FigureKind::Percent,
        )
        .figure("speed", t.t("watch.speed", &[]), FigureKind::Rate)
        .figure("sources", t.t("watch.sources", &[]), FigureKind::Ratio)
        .slice_map(t.t("watch.slices", &[]))
        .action("cancel", t.t("watch.cancel", &[]))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    use crate::port::post;

    #[tokio::test]
    async fn a_viewer_reading_french_is_told_what_a_swarm_is_in_french() {
        let (status, described) = post(
            routes(),
            (),
            "/_port/watchable/describe",
            json!({ "locale": "fr" }),
        )
        .await;

        assert_eq!(status, axum::http::StatusCode::OK);
        assert_eq!(
            described,
            json!({
                "label": "Torrents",
                "icon": "magnet",
                "figures": [
                    { "key": "downloaded", "label": "Téléchargé", "kind": "percent" },
                    { "key": "speed", "label": "Vitesse", "kind": "rate" },
                    { "key": "sources", "label": "Pairs", "kind": "ratio" },
                ],
                "map": { "label": "Morceaux reçus" },
                "actions": [{ "key": "cancel", "label": "Annuler" }],
            })
        );
    }

    #[tokio::test]
    async fn the_same_viewer_reading_english_gets_the_same_keys_and_other_words() {
        let (_, described) = post(
            routes(),
            (),
            "/_port/watchable/describe",
            json!({ "locale": "en" }),
        )
        .await;

        assert_eq!(described["figures"][2]["label"], json!("Peers"));
        assert_eq!(described["figures"][2]["key"], json!("sources"));
        assert_eq!(described["actions"][0]["label"], json!("Cancel"));
    }

    #[test]
    fn every_figure_it_declares_is_one_the_progress_payload_answers() {
        let described = describe("en");

        let keys: Vec<&str> = described
            .figures
            .iter()
            .map(|figure| figure.key.as_str())
            .collect();

        assert_eq!(keys, ["downloaded", "speed", "sources"]);
    }
}
