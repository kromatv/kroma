use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

/// One source a client draws for a capability. The core adds the mount it is
/// reached at, so a module never states its own.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[non_exhaustive]
pub struct Source {
    pub label: String,
    pub icon: String,
    pub figures: Vec<Figure>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub map: Option<SliceMap>,
    pub actions: Vec<Action>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[non_exhaustive]
pub struct Figure {
    pub key: String,
    pub label: String,
    pub kind: FigureKind,
}

/// How a client formats a figure: a fraction of one, bytes per second, two
/// counts as `[have, seen]`, a whole number, or words.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FigureKind {
    Percent,
    Rate,
    Ratio,
    Count,
    Text,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[non_exhaustive]
pub struct SliceMap {
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[non_exhaustive]
pub struct Action {
    pub key: String,
    pub label: String,
}

impl Source {
    /// `icon` is a word from the store's icon vocabulary, never a URL.
    pub fn new(label: impl Into<String>, icon: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            icon: icon.into(),
            figures: Vec::new(),
            map: None,
            actions: Vec::new(),
        }
    }

    /// `key` is what this source's own payload spells the number with, and is
    /// never shown.
    pub fn figure(
        mut self,
        key: impl Into<String>,
        label: impl Into<String>,
        kind: FigureKind,
    ) -> Self {
        self.figures.push(Figure {
            key: key.into(),
            label: label.into(),
            kind,
        });
        self
    }

    pub fn slice_map(mut self, label: impl Into<String>) -> Self {
        self.map = Some(SliceMap {
            label: label.into(),
        });
        self
    }

    /// `key` is what the client asks this source to do, and is never shown.
    pub fn action(mut self, key: impl Into<String>, label: impl Into<String>) -> Self {
        self.actions.push(Action {
            key: key.into(),
            label: label.into(),
        });
        self
    }
}

/// The `describe` route a module answering `capability` mounts, beside whatever
/// else it serves. `describe` is handed the viewer's locale and answers in it.
pub fn routes<S, F>(capability: &str, describe: F) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    F: Fn(&str) -> Source + Clone + Send + Sync + 'static,
{
    Router::new().route(
        &format!("/_port/{capability}/describe"),
        post(move |Json(asked): Json<Asked>| {
            let describe = describe.clone();
            async move { Json(describe(&asked.locale)) }
        }),
    )
}

#[derive(Debug, Default, Deserialize)]
struct Asked {
    #[serde(default)]
    locale: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    use serde_json::{json, Value};

    use crate::host::test_serve::{blocking, serve};

    fn torrents(locale: &str) -> Source {
        let peers = match locale {
            "fr" => "Pairs",
            _ => "Peers",
        };
        Source::new("Torrents", "magnet")
            .figure("sources", peers, FigureKind::Ratio)
            .slice_map("Pieces")
            .action("cancel", "Cancel")
    }

    async fn described(asked: Value) -> Value {
        let resolve = serve(routes("watchable", torrents), ()).await;

        blocking(move || crate::host::call_raw(&resolve, "watchable/describe", &asked).unwrap())
            .await
    }

    #[test]
    fn a_source_serializes_under_the_keys_a_client_reads() {
        let source = Source::new("Torrents", "magnet")
            .figure("downloaded", "Téléchargé", FigureKind::Percent)
            .figure("speed", "Vitesse", FigureKind::Rate)
            .slice_map("Morceaux reçus")
            .action("cancel", "Annuler");

        let wire = serde_json::to_value(source).unwrap();

        assert_eq!(
            wire,
            json!({
                "label": "Torrents",
                "icon": "magnet",
                "figures": [
                    { "key": "downloaded", "label": "Téléchargé", "kind": "percent" },
                    { "key": "speed", "label": "Vitesse", "kind": "rate" },
                ],
                "map": { "label": "Morceaux reçus" },
                "actions": [{ "key": "cancel", "label": "Annuler" }],
            })
        );
    }

    #[test]
    fn a_source_reporting_no_slice_map_leaves_the_key_out_rather_than_null() {
        let source = Source::new("Usenet", "download").figure("speed", "Speed", FigureKind::Rate);

        let wire = serde_json::to_value(source).unwrap();

        assert_eq!(wire.get("map"), None);
    }

    #[test]
    fn every_kind_a_client_can_draw_spells_itself_in_one_word() {
        let kinds = [
            FigureKind::Percent,
            FigureKind::Rate,
            FigureKind::Ratio,
            FigureKind::Count,
            FigureKind::Text,
        ]
        .map(|kind| serde_json::to_value(kind).unwrap());

        assert_eq!(
            kinds,
            ["percent", "rate", "ratio", "count", "text"].map(|word| json!(word))
        );
    }

    #[tokio::test]
    async fn describing_answers_in_the_language_the_viewer_was_asked_about() {
        let french = described(json!({ "locale": "fr" })).await;

        assert_eq!(french["figures"][0]["label"], json!("Pairs"));
        assert_eq!(french["figures"][0]["kind"], json!("ratio"));
    }

    #[tokio::test]
    async fn a_caller_naming_no_language_gets_the_modules_own_fallback() {
        let unasked = described(json!({})).await;

        assert_eq!(unasked["figures"][0]["label"], json!("Peers"));
    }
}
