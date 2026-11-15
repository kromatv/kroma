//! Plural categories and the rules that pick one.
//!
//! Pluralization is opt-in per key: a key gets a `_one` variant only for
//! languages you choose to pluralize, and [`crate::I18n::translate`] falls
//! back to the base key otherwise. An engine is singular at one until
//! [`crate::Builder::plural_rule`] gives it another rule. [`cldr`] is the one
//! to give: the CLDR categories of a whole count, `zero` to `many`, checked
//! against ICU for 70 languages and singular at one for any other.

mod cldr;

pub use cldr::cldr;

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

/// `one` for 0 and 1, else `other`: the CLDR rule for the Romance languages
/// that keep the singular at zero ("0 saison").
pub fn zero_one_other(_locale: &str, count: i64) -> Category {
    if count == 0 || count == 1 {
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
    fn the_romance_rule_keeps_the_singular_at_zero() {
        assert_eq!(zero_one_other("fr", 0), Category::One);
        assert_eq!(zero_one_other("fr", 1), Category::One);
        assert_eq!(zero_one_other("fr", 2), Category::Other);
        assert_eq!(zero_one_other("fr", -1), Category::Other);
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
