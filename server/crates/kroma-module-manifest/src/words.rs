use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// What a module says about itself in one language. A word left out reads in
/// English, from the manifest's own field.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Words {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tagline: Option<String>,
}

/// A module's words in each language it speaks besides English, by language
/// tag (`fr`, `pt-BR`).
pub type Translations = BTreeMap<String, Words>;

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::ModuleManifest;

    #[test]
    fn a_manifest_that_speaks_english_alone_still_loads() {
        let manifest: ModuleManifest = serde_json::from_value(json!({
            "id": "tv.kroma.x", "name": "X", "version": "1.0.0"
        }))
        .unwrap();

        assert_eq!(manifest.tagline, None);
        assert!(manifest.translations.is_empty());
        assert!(serde_json::to_value(&manifest)
            .unwrap()
            .get("translations")
            .is_none());
    }

    #[test]
    fn a_manifest_keeps_its_sentence_and_its_words_in_each_language() {
        let manifest: ModuleManifest = serde_json::from_value(json!({
            "id": "tv.kroma.x", "name": "Remote access", "version": "1.0.0",
            "tagline": "Watch away from home.",
            "translations": { "fr": { "name": "Accès à distance", "tagline": "Regardez loin de chez vous." } }
        }))
        .unwrap();

        let fr = &manifest.translations["fr"];

        assert_eq!(manifest.tagline.as_deref(), Some("Watch away from home."));
        assert_eq!(fr.name.as_deref(), Some("Accès à distance"));
        assert_eq!(fr.description, None);
        assert_eq!(
            serde_json::to_value(&manifest).unwrap()["translations"]["fr"]["tagline"],
            "Regardez loin de chez vous."
        );
    }
}
