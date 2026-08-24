//! One interpolation variable on a notification.

use serde::{Deserialize, Serialize};

/// One interpolation variable on a notification. Producers tag which kind they
/// mean, so user-controlled text that collides with a catalog key is never
/// silently translated.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum ParamValue {
    Text(String),
    Key(String),
    // A bare string from a row written before params were typed, where a key
    // and a literal were the same thing on the wire. It stays ambiguous on
    // purpose: resolved only when it names a REAL catalog entry, and only for
    // these old rows. See `services::notify::render`.
    Legacy(String),
}

impl ParamValue {
    /// `translate` answers `None` for a string the catalogs do not know, which
    /// lets [`ParamValue::Legacy`] fall back to its own literal text while
    /// [`ParamValue::Key`] keeps the key visible rather than rendering blank.
    pub fn resolve(&self, translate: impl FnOnce(&str) -> Option<String>) -> String {
        match self {
            ParamValue::Text(text) => text.clone(),
            ParamValue::Key(key) => translate(key).unwrap_or_else(|| key.clone()),
            ParamValue::Legacy(text) => translate(text).unwrap_or_else(|| text.clone()),
        }
    }
}

impl<'de> Deserialize<'de> for ParamValue {
    // Accepts the tagged form AND a bare string: without the latter an existing
    // row's whole `params` map fails to parse and renders unsubstituted.
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Raw {
            Tagged { kind: String, value: String },
            Legacy(String),
        }
        Ok(match Raw::deserialize(deserializer)? {
            Raw::Tagged { kind, value } if kind == "key" => ParamValue::Key(value),
            Raw::Tagged { value, .. } => ParamValue::Text(value),
            Raw::Legacy(text) => ParamValue::Legacy(text),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;

    #[test]
    fn a_param_round_trips_and_still_reads_the_legacy_bare_string() {
        let typed = serde_json::to_string(&ParamValue::Key("jobs.x.name".into())).unwrap();
        assert_eq!(typed, r#"{"kind":"key","value":"jobs.x.name"}"#);
        assert_eq!(
            serde_json::from_str::<ParamValue>(&typed).unwrap(),
            ParamValue::Key("jobs.x.name".into())
        );

        // Bare strings predate typed params and read back as `Legacy`.
        assert_eq!(
            serde_json::from_str::<ParamValue>(r#""Dune""#).unwrap(),
            ParamValue::Legacy("Dune".into())
        );
        let legacy: BTreeMap<String, ParamValue> =
            serde_json::from_str(r#"{"title":"Dune","job":"jobs.library.scan.name"}"#).unwrap();
        assert_eq!(
            legacy.get("title"),
            Some(&ParamValue::Legacy("Dune".into()))
        );
        assert_eq!(
            legacy.get("job"),
            Some(&ParamValue::Legacy("jobs.library.scan.name".into()))
        );

        assert_eq!(
            serde_json::from_str::<ParamValue>(
                r#"{"kind":"text","value":"jobs.library.scan.name"}"#
            )
            .unwrap(),
            ParamValue::Text("jobs.library.scan.name".into())
        );
    }
}
