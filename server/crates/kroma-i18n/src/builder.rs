//! Assembling an [`I18n`] from catalogs.

use std::collections::HashMap;
use std::error::Error;
use std::fmt;

use crate::{one_other, I18n, Locale, PluralRule};

/// Why [`Builder::build`] failed.
#[derive(Debug)]
pub enum BuildError {
    MissingDefault,
    DefaultNotLoaded(String),
    Catalog(String, serde_json::Error),
}

impl fmt::Display for BuildError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BuildError::MissingDefault => write!(f, "no default locale set"),
            BuildError::DefaultNotLoaded(c) => write!(f, "no catalog for default locale `{c}`"),
            BuildError::Catalog(c, e) => write!(f, "catalog `{c}` is not a flat string map: {e}"),
        }
    }
}

impl Error for BuildError {}

/// Builds an [`I18n`]. See [`I18n::builder`].
pub struct Builder {
    default: Option<String>,
    raw: Vec<(String, String)>,
    parsed: Vec<(String, HashMap<String, String>)>,
    plural: PluralRule,
    label_key: fn(&str) -> String,
}

impl Default for Builder {
    fn default() -> Self {
        Builder {
            default: None,
            raw: Vec::new(),
            parsed: Vec::new(),
            plural: one_other,
            // Native display name lives at `lang.<code>` by convention.
            label_key: |code| format!("lang.{code}"),
        }
    }
}

impl Builder {
    /// The fallback locale: a key missing in the active locale resolves here,
    /// then to the raw key. Must have a catalog. Required.
    pub fn default_locale(mut self, code: impl Into<String>) -> Self {
        self.default = Some(code.into());
        self
    }

    /// Use a custom plural rule instead of the default [`one_other`].
    pub fn plural_rule(mut self, rule: PluralRule) -> Self {
        self.plural = rule;
        self
    }

    /// Override how a locale's native-label key is derived from its code
    /// (default: `|c| format!("lang.{c}")`). Used by [`I18n::normalize_locale`].
    pub fn label_key(mut self, f: fn(&str) -> String) -> Self {
        self.label_key = f;
        self
    }

    /// Add a locale from a flat `{ "key": "value" }` JSON catalog. Parsed at
    /// [`build`](Self::build).
    pub fn catalog_json(mut self, code: impl Into<String>, json: impl Into<String>) -> Self {
        self.raw.push((code.into(), json.into()));
        self
    }

    /// Add a locale from an already-parsed map.
    pub fn catalog(mut self, code: impl Into<String>, entries: HashMap<String, String>) -> Self {
        self.parsed.push((code.into(), entries));
        self
    }

    /// Parse/validate everything and construct the engine.
    pub fn build(self) -> Result<I18n, BuildError> {
        let default = self.default.ok_or(BuildError::MissingDefault)?;
        let mut locales = Vec::with_capacity(self.raw.len() + self.parsed.len());
        for (code, json) in self.raw {
            let entries =
                serde_json::from_str(&json).map_err(|e| BuildError::Catalog(code.clone(), e))?;
            locales.push(Locale {
                label_key: (self.label_key)(&code),
                code,
                entries,
            });
        }
        for (code, entries) in self.parsed {
            locales.push(Locale {
                label_key: (self.label_key)(&code),
                code,
                entries,
            });
        }
        if !locales.iter().any(|l| l.code == default) {
            return Err(BuildError::DefaultNotLoaded(default));
        }
        // Default locale leads the ordering.
        locales.sort_by_key(|l| l.code != default);
        Ok(I18n {
            default,
            locales,
            plural: self.plural,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builder_validates() {
        assert!(matches!(
            I18n::builder().build(),
            Err(BuildError::MissingDefault)
        ));
        assert!(matches!(
            I18n::builder()
                .default_locale("de")
                .catalog_json("en", "{}")
                .build(),
            Err(BuildError::DefaultNotLoaded(_))
        ));
        assert!(matches!(
            I18n::builder()
                .default_locale("en")
                .catalog_json("en", "not json")
                .build(),
            Err(BuildError::Catalog(..))
        ));
    }

    #[test]
    fn every_build_error_says_which_catalog_is_wrong() {
        // These surface at boot, where the only diagnostic is the message, so
        // each one has to name the locale it is talking about.
        let Err(missing) = I18n::builder().build() else {
            panic!("no default is an error")
        };
        let missing = missing.to_string();
        assert!(missing.contains("default locale"), "{missing}");

        let Err(not_loaded) = I18n::builder()
            .default_locale("de")
            .catalog_json("en", "{}")
            .build()
        else {
            panic!("a default with no catalog is an error")
        };
        let not_loaded = not_loaded.to_string();
        assert!(not_loaded.contains("de"), "{not_loaded}");

        // A catalog that is not a flat string map names the catalog AND carries
        // the parse error, so the broken line is findable.
        let Err(nested) = I18n::builder()
            .default_locale("fr")
            .catalog_json("fr", r#"{ "a": { "b": "c" } }"#)
            .build()
        else {
            panic!("a nested catalog is an error")
        };
        let nested = nested.to_string();
        assert!(nested.contains("fr"), "{nested}");
        assert!(nested.contains("flat"), "{nested}");
    }

    #[test]
    fn a_catalog_can_be_supplied_already_parsed() {
        // The app embeds its catalogs as JSON, but a module can hand over a map
        // it built itself - both doors must reach the same engine.
        let mut entries = HashMap::new();
        entries.insert("hi".to_string(), "Hallo {name}".to_string());
        let i18n = I18n::builder()
            .default_locale("de")
            .catalog("de", entries)
            .build()
            .unwrap();
        assert_eq!(i18n.translate("de", "hi", &[("name", "Ana")]), "Hallo Ana");
    }

    #[test]
    fn the_label_key_derivation_is_overridable() {
        // The app decides where its native language names live; the engine only
        // derives the key.
        let i18n = I18n::builder()
            .default_locale("fr")
            .label_key(|c| format!("locales.{c}.native"))
            .catalog_json("fr", r#"{ "locales.fr.native": "Français" }"#)
            .build()
            .unwrap();
        let info: Vec<_> = i18n.locales().collect();
        assert_eq!(info[0].label_key, "locales.fr.native");
    }
}
