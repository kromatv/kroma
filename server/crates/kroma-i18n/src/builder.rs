//! Assembling an [`I18n`] from catalogs.

use std::collections::hash_map::Entry;
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
    DuplicateKey(String, String),
}

impl fmt::Display for BuildError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BuildError::MissingDefault => write!(f, "no default locale set"),
            BuildError::DefaultNotLoaded(c) => write!(f, "no catalog for default locale `{c}`"),
            BuildError::Catalog(c, e) => write!(f, "catalog `{c}` is not a flat string map: {e}"),
            BuildError::DuplicateKey(c, k) => {
                write!(f, "catalog `{c}` defines `{k}` in two of its parts")
            }
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
    /// [`build`](Self::build). A locale may arrive in several parts, one file
    /// per namespace; the parts merge and must not repeat a key.
    pub fn catalog_json(mut self, code: impl Into<String>, json: impl Into<String>) -> Self {
        self.raw.push((code.into(), json.into()));
        self
    }

    /// Add a locale from an already-parsed map. Merges like
    /// [`catalog_json`](Self::catalog_json).
    pub fn catalog(mut self, code: impl Into<String>, entries: HashMap<String, String>) -> Self {
        self.parsed.push((code.into(), entries));
        self
    }

    /// Parse/validate everything and construct the engine.
    pub fn build(self) -> Result<I18n, BuildError> {
        let default = self.default.ok_or(BuildError::MissingDefault)?;
        let mut locales: Vec<Locale> = Vec::new();
        for (code, json) in self.raw {
            let entries: HashMap<String, String> =
                serde_json::from_str(&json).map_err(|e| BuildError::Catalog(code.clone(), e))?;
            merge_part(&mut locales, code, entries, self.label_key)?;
        }
        for (code, entries) in self.parsed {
            merge_part(&mut locales, code, entries, self.label_key)?;
        }
        if !locales.iter().any(|l| l.code == default) {
            return Err(BuildError::DefaultNotLoaded(default));
        }
        // Default locale leads the ordering.
        locales.sort_by_key(|l| l.code != default);
        // `$t(key)` references expand once, here, so translating stays a single
        // interpolation pass. Mirrors `expandRefs` in @kroma/i18n. The default
        // locale leads the ordering, so the rest borrow its entries as the
        // fallback rather than each taking a copy of a few thousand strings.
        if let Some((first, rest)) = locales.split_first_mut() {
            let fallback = std::mem::take(&mut first.entries);
            for locale in rest {
                let entries = std::mem::take(&mut locale.entries);
                locale.entries = crate::expand_refs(entries, &fallback);
            }
            first.entries = crate::expand_refs(fallback, &HashMap::new());
        }
        Ok(I18n {
            default,
            locales,
            plural: self.plural,
        })
    }
}

fn merge_part(
    locales: &mut Vec<Locale>,
    code: String,
    mut entries: HashMap<String, String>,
    label_key: fn(&str) -> String,
) -> Result<(), BuildError> {
    // `$schema` points an editor at the catalog schema; it is not a message,
    // and the TypeScript half drops it for the same reason.
    entries.remove("$schema");
    let Some(locale) = locales.iter_mut().find(|l| l.code == code) else {
        locales.push(Locale {
            label_key: label_key(&code),
            code,
            entries,
        });
        return Ok(());
    };
    for (key, value) in entries {
        match locale.entries.entry(key) {
            Entry::Occupied(taken) => {
                return Err(BuildError::DuplicateKey(code, taken.key().clone()));
            }
            Entry::Vacant(slot) => {
                slot.insert(value);
            }
        }
    }
    Ok(())
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
    fn a_locale_assembles_from_several_parts_that_may_quote_each_other() {
        let i18n = I18n::builder()
            .default_locale("en")
            .catalog_json("en", r#"{ "nav.home": "Home" }"#)
            .catalog_json("en", r#"{ "player.back": "Back to $t(nav.home)" }"#)
            .catalog_json("fr", r#"{ "nav.home": "Accueil" }"#)
            .build()
            .unwrap();

        assert_eq!(i18n.translate("en", "player.back", &[]), "Back to Home");
        assert_eq!(i18n.translate("fr", "nav.home", &[]), "Accueil");
        assert_eq!(i18n.supported().collect::<Vec<_>>(), ["en", "fr"]);
    }

    #[test]
    fn a_key_two_parts_both_define_is_an_error_that_names_it() {
        let Err(err) = I18n::builder()
            .default_locale("en")
            .catalog_json("en", r#"{ "nav.home": "Home" }"#)
            .catalog(
                "en",
                HashMap::from([("nav.home".to_string(), "Start".to_string())]),
            )
            .build()
        else {
            panic!("a repeated key is an error")
        };

        assert!(matches!(err, BuildError::DuplicateKey(..)));
        let message = err.to_string();
        assert!(message.contains("`en`"), "{message}");
        assert!(message.contains("`nav.home`"), "{message}");
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
