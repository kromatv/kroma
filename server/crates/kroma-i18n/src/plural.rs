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

/// `one` for 0 and 1, else `other`: the CLDR rule for the Romance languages
/// that keep the singular at zero ("0 saison").
pub fn zero_one_other(_locale: &str, count: i64) -> Category {
    if count == 0 || count == 1 {
        Category::One
    } else {
        Category::Other
    }
}

/// The base subtag of a tag, without allocating: `fr_CH` and `fr-CH` are `fr`.
fn base(tag: &str) -> &str {
    let end = tag.find(['-', '_']).unwrap_or(tag.len());
    &tag[..end]
}

/// CLDR categories for the languages this crate knows how to tell apart,
/// [`one_other`] for the rest.
///
/// This is the rule to pass unless you have a reason not to: a JavaScript peer
/// reading the same catalog gets full CLDR from `Intl.PluralRules`, and a
/// server that guesses differently renders a count one way in a notification
/// and another way on screen. Dispatching here rather than in each consumer is
/// what keeps that from being every consumer's problem to remember.
pub fn cldr(locale: &str, count: i64) -> Category {
    // Romance languages put zero in `one`; English and the Germanic ones do not.
    const ZERO_IS_SINGULAR: &[&str] = &["fr", "pt", "es", "it", "ca", "ro"];
    if ZERO_IS_SINGULAR
        .iter()
        .any(|code| base(locale).eq_ignore_ascii_case(code))
    {
        return zero_one_other(locale, count);
    }
    one_other(locale, count)
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
    fn the_cldr_rule_reads_a_tag_however_it_is_spelled() {
        for tag in ["fr", "FR", "fr-CH", "fr_CA", "pt-BR"] {
            assert_eq!(cldr(tag, 0), Category::One, "{tag}");
        }
        assert_eq!(cldr("en", 0), Category::Other);
        assert_eq!(cldr("en-US", 0), Category::Other);
        assert_eq!(cldr("de", 0), Category::Other);
        assert_eq!(cldr("fr", 2), Category::Other);
        assert_eq!(cldr("en", 1), Category::One);
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
