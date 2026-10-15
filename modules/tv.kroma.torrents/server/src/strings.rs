use std::sync::OnceLock;

use kroma_module_sdk::i18n::{self, I18n, Translator};

const CATALOGS: &[(&str, &str)] = kroma_module_sdk::embedded_locales!();

pub fn for_locale(locale: &str) -> Translator<'static> {
    engine().translator(locale)
}

fn engine() -> &'static I18n {
    static ENGINE: OnceLock<I18n> = OnceLock::new();
    ENGINE.get_or_init(|| i18n::engine(CATALOGS).expect("this module's own catalogs"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_catalogs_the_console_page_reads_are_the_ones_the_sidecar_resolves() {
        let codes: Vec<&str> = CATALOGS.iter().map(|(code, _)| *code).collect();

        assert_eq!(codes, ["en", "fr"]);
        assert_eq!(for_locale("fr").t("watch.speed", &[]), "Vitesse");
        assert_eq!(for_locale("en").t("watch.speed", &[]), "Speed");
    }

    #[test]
    fn a_locale_no_catalog_answers_falls_back_to_english_rather_than_to_the_key() {
        assert_eq!(for_locale("de").t("watch.sources", &[]), "Peers");
        assert_eq!(for_locale("fr_CH").t("watch.sources", &[]), "Pairs");
        assert_eq!(for_locale("").t("watch.sources", &[]), "Peers");
    }
}
