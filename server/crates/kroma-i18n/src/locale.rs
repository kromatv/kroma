//! Locale-tag algebra: which supported catalog a BCP-47 tag resolves to.

use crate::I18n;

impl I18n {
    // An exact match wins first (so a regional catalog like `fr-CH` wins if
    // shipped), else the base language with region and case normalized.
    pub(crate) fn resolve_code(&self, tag: &str) -> Option<&str> {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            return None;
        }
        if let Some(l) = self.locales.iter().find(|l| l.code == trimmed) {
            return Some(&l.code);
        }
        let base = base_language(trimmed);
        self.locales
            .iter()
            .find(|l| base_language(&l.code) == base)
            .map(|l| l.code.as_str())
    }

    /// Map a BCP-47 tag (`"en-US"`, `"FR"`, `"fr_CH"`) or a native display name
    /// (from the `label_key` catalog entry) to a supported locale, or `None`.
    pub fn normalize_locale(&self, tag: &str) -> Option<&str> {
        if let Some(code) = self.resolve_code(tag) {
            return Some(code);
        }
        // Native display name (data-driven from each locale's own label entry).
        let trimmed = tag.trim();
        self.locales
            .iter()
            .find(|l| l.entries.get(&l.label_key).map(String::as_str) == Some(trimmed))
            .map(|l| l.code.as_str())
    }

    /// Best locale: an explicit `preferred` wins, then the first resolvable
    /// `Accept-Language` entry, else the default.
    pub fn detect_locale(&self, preferred: Option<&str>, accept_language: Option<&str>) -> &str {
        if let Some(loc) = preferred.and_then(|p| self.normalize_locale(p)) {
            return loc;
        }
        if let Some(header) = accept_language {
            for part in header.split(',') {
                let tag = part.split(';').next().unwrap_or("").trim();
                if let Some(loc) = self.normalize_locale(tag) {
                    return loc;
                }
            }
        }
        &self.default
    }
}

// The base language subtag, region stripped and lowercased: `"fr_CH"` → `"fr"`,
// `"en-US"` → `"en"`, `"FR"` → `"fr"`.
fn base_language(tag: &str) -> String {
    tag.split(['-', '_'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use crate::test_support::fixture;
    use crate::I18n;

    #[test]
    fn normalize_and_detect() {
        let i = fixture();
        assert_eq!(i.normalize_locale("en-US"), Some("en"));
        assert_eq!(i.normalize_locale("FR"), Some("fr"));
        assert_eq!(i.normalize_locale("Français"), Some("fr"));
        assert_eq!(i.normalize_locale("English"), Some("en"));
        assert_eq!(i.normalize_locale("de"), None);
        assert_eq!(i.detect_locale(Some("de"), Some("en-US,en;q=0.9")), "en");
        assert_eq!(i.detect_locale(None, None), "fr");
    }

    #[test]
    fn regional_variants_resolve_to_base() {
        let i = fixture();
        for tag in ["fr", "fr_FR", "fr-CH", "FR", "fr_CA"] {
            assert_eq!(i.normalize_locale(tag), Some("fr"), "tag {tag}");
            assert_eq!(
                i.t(tag, "seasons", &[("count", "2")]),
                "2 saisons",
                "tag {tag}"
            );
        }
        assert_eq!(i.t("en-GB", "hi", &[("name", "Jo")]), "Hi Jo");
        let r = I18n::builder()
            .default_locale("en")
            .catalog_json("en", r#"{ "color": "color" }"#)
            .catalog_json("en-GB", r#"{ "color": "colour" }"#)
            .build()
            .unwrap();
        assert_eq!(r.t("en-GB", "color", &[]), "colour"); // exact
        assert_eq!(r.t("en-AU", "color", &[]), "color"); // base fallback
    }

    #[test]
    fn a_browser_header_picks_the_first_locale_we_actually_have() {
        // Accept-Language is a ranked list of things the browser wants, most of
        // which we will not have. Taking the first ENTRY rather than the first
        // SUPPORTED one would drop everyone whose top choice we lack to the
        // default.
        let i18n = fixture();
        assert_eq!(
            i18n.detect_locale(None, Some("de-DE,de;q=0.9,en;q=0.8")),
            "en"
        );
        // Quality values are stripped before matching.
        assert_eq!(i18n.detect_locale(None, Some("en;q=0.8")), "en");
        // Region and case are normalized away.
        assert_eq!(i18n.detect_locale(None, Some("EN-GB")), "en");
        // Nothing we have -> the default.
        assert_eq!(i18n.detect_locale(None, Some("de,it,ja")), "fr");
        assert_eq!(i18n.detect_locale(None, None), "fr");
    }

    #[test]
    fn an_account_preference_outranks_the_browser() {
        // The user chose this in their profile; the browser's header is a guess.
        let i18n = fixture();
        assert_eq!(i18n.detect_locale(Some("en"), Some("fr")), "en");
        // ...but a preference we cannot serve falls through to the header
        // rather than to the default.
        assert_eq!(i18n.detect_locale(Some("de"), Some("en")), "en");
        assert_eq!(i18n.detect_locale(Some(""), Some("en")), "en");
    }
}
