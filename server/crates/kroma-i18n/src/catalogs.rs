use crate::{cldr, BuildError, I18n};

/// An engine over `catalogs`, as `(locale, json)` pairs, with CLDR plurals. It
/// falls back to `preferred` where that is among them and to the first catalog
/// otherwise; none at all is an error rather than an engine answering every key
/// with itself.
pub fn from_catalogs(preferred: &str, catalogs: &[(&str, &str)]) -> Result<I18n, BuildError> {
    let fallback = catalogs
        .iter()
        .map(|(code, _)| *code)
        .find(|code| *code == preferred)
        .or_else(|| catalogs.first().map(|(code, _)| *code))
        .unwrap_or(preferred);
    catalogs
        .iter()
        .fold(
            I18n::builder().default_locale(fallback).plural_rule(cldr),
            |builder, (code, json)| builder.catalog_json(*code, *json),
        )
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    const RU: &str = r#"{ "files_one": "{count} файл", "files_few": "{count} файла",
                          "files_many": "{count} файлов", "files_other": "{count} файла" }"#;
    const ES: &str = r#"{ "files_one": "{count} archivo", "files_other": "{count} archivos" }"#;

    #[test]
    fn a_catalog_in_a_language_with_few_and_many_picks_the_variant_cldr_names() {
        let i18n = from_catalogs("ru", &[("ru", RU)]).unwrap();

        assert_eq!(i18n.t("ru", "files", &[("count", "1")]), "1 файл");
        assert_eq!(i18n.t("ru", "files", &[("count", "3")]), "3 файла");
        assert_eq!(i18n.t("ru", "files", &[("count", "5")]), "5 файлов");
    }

    #[test]
    fn a_spanish_catalog_is_plural_at_zero() {
        let i18n = from_catalogs("es", &[("es", ES)]).unwrap();

        assert_eq!(i18n.t("es", "files", &[("count", "0")]), "0 archivos");
        assert_eq!(i18n.t("es", "files", &[("count", "1")]), "1 archivo");
    }
}
