use crate::I18n;

pub(crate) fn fixture() -> I18n {
    // A tiny app-agnostic catalog set, exercising the engine generically.
    I18n::builder()
        .default_locale("fr")
        .catalog_json(
            "fr",
            r#"{ "lang.fr": "Français", "lang.en": "Anglais",
                 "hi": "Salut {name}", "seasons": "{count} saisons", "seasons_one": "{count} saison" }"#,
        )
        .catalog_json(
            "en",
            r#"{ "lang.en": "English", "hi": "Hi {name}",
                 "seasons": "{count} seasons", "seasons_one": "{count} season" }"#,
        )
        .build()
        .unwrap()
}
