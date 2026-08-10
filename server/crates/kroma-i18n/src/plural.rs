//! Plural categories and the default rule.
//!
//! Pluralization is opt-in per key: a key gets a `_one` variant only for
//! languages you choose to pluralize, and [`crate::I18n::translate`] falls
//! back to the base key otherwise. Supply [`crate::Builder::plural_rule`]
//! only when a language needs more than "singular at 1".

/// A CLDR plural category. Catalog keys carry the category as a suffix
/// (`key_one`, `key_other`, …); the engine appends the selected one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Zero,
    One,
    Two,
    Few,
    Many,
    Other,
}

impl Category {
    /// The catalog-key suffix (`"one"`, `"other"`, …).
    pub fn suffix(self) -> &'static str {
        match self {
            Category::Zero => "zero",
            Category::One => "one",
            Category::Two => "two",
            Category::Few => "few",
            Category::Many => "many",
            Category::Other => "other",
        }
    }
}

/// Picks a [`Category`] for a locale + integer count. A plain `fn`, so it's
/// allocation-free and trivially `Send + Sync`; pass a custom one to
/// [`crate::Builder::plural_rule`].
pub type PluralRule = fn(locale: &str, count: i64) -> Category;

/// The default rule: `one` for exactly 1, else `other`. Correct for English and
/// the great majority of catalogs, which only distinguish singular from plural.
pub fn one_other(_locale: &str, count: i64) -> Category {
    if count == 1 {
        Category::One
    } else {
        Category::Other
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_suffix_is_the_cldr_category_name_catalog_keys_are_written_with() {
        assert_eq!(Category::Zero.suffix(), "zero");
        assert_eq!(Category::One.suffix(), "one");
        assert_eq!(Category::Two.suffix(), "two");
        assert_eq!(Category::Few.suffix(), "few");
        assert_eq!(Category::Many.suffix(), "many");
        assert_eq!(Category::Other.suffix(), "other");
    }

    #[test]
    fn the_default_rule_is_singular_at_one_and_plural_everywhere_else() {
        assert_eq!(one_other("en", 1), Category::One);
        assert_eq!(one_other("fr", 1), Category::One);
        assert_eq!(one_other("en", 0), Category::Other);
        assert_eq!(one_other("en", 2), Category::Other);
        assert_eq!(one_other("en", -1), Category::Other);
    }
}
