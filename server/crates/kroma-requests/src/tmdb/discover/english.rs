use super::wire::{RawTranslationData, TranslationsResp};

const LANGUAGE: &str = "en";
const REGION: &str = "US";

pub(super) fn english(translations: Option<TranslationsResp>) -> RawTranslationData {
    let mut english: Vec<_> = translations
        .map(|t| t.translations)
        .unwrap_or_default()
        .into_iter()
        .filter(|t| t.iso_639_1 == LANGUAGE)
        .collect();
    english.sort_by_key(|t| t.iso_3166_1 != REGION);
    let data = english
        .into_iter()
        .next()
        .map(|t| t.data)
        .unwrap_or_default();
    RawTranslationData {
        overview: written(data.overview),
        tagline: written(data.tagline),
    }
}

pub(super) fn written(text: Option<String>) -> Option<String> {
    text.filter(|s| !s.is_empty())
}
