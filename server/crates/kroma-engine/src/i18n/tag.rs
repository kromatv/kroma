//! BCP 47 tags as the server reads them: how one is spelled, what it is made
//! of, and which of the offered locales it names.

/// `tag` in the spelling BCP 47 recommends: the language in lower case, a
/// script in Title case, a region in upper case, joined by hyphens.
pub fn canonical(tag: &str) -> String {
    tag.trim()
        .split(['-', '_'])
        .enumerate()
        .map(|(position, subtag)| match position {
            0 => subtag.to_ascii_lowercase(),
            _ if is_script(subtag) => title_case(subtag),
            _ if is_region(subtag) => subtag.to_ascii_uppercase(),
            _ => subtag.to_ascii_lowercase(),
        })
        .collect::<Vec<_>>()
        .join("-")
}

/// The language subtag, as it is spelled.
pub fn language(tag: &str) -> &str {
    tag.split(['-', '_']).next().unwrap_or(tag)
}

/// The script subtag, as it is spelled: `Hant` of `zh-Hant-TW`.
pub fn script(tag: &str) -> Option<&str> {
    tag.split(['-', '_'])
        .nth(1)
        .filter(|subtag| is_script(subtag))
}

/// The ISO 3166-1 alpha-2 region, as it is spelled: `TW` of `zh-Hant-TW`. A
/// script is never mistaken for one.
pub fn region(tag: &str) -> Option<&str> {
    tag.split(['-', '_'])
        .skip(1)
        .find(|subtag| !is_script(subtag))
        .filter(|subtag| is_region(subtag))
}

/// The tags `tag` belongs to, nearest first: `zh-Hant-TW` gives `zh-Hant`,
/// then `zh`.
pub fn parents(tag: &str) -> impl Iterator<Item = &str> {
    std::iter::successors(Some(tag), |rest| rest.rfind('-').map(|cut| &rest[..cut])).skip(1)
}

/// The entry of `offered` that `tag` names, however it is spelled: itself, else
/// the script a Chinese region writes in, else the nearest tag it belongs to.
/// A tag that only shares a language with an offered one names none.
pub fn nearest<'a>(tag: &str, offered: &[&'a str]) -> Option<&'a str> {
    let tag = canonical(tag);
    let known = |code: &str| offered.iter().copied().find(|locale| *locale == code);
    known(&tag)
        .or_else(|| chinese_script_of(&tag).and_then(known))
        .or_else(|| parents(&tag).find_map(known))
}

// CLDR's likely subtags: `zh-TW`, `zh-HK` and `zh-MO` are `zh-Hant`, and a
// region it does not list is `zh`, which is `zh-Hans-CN`.
// https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-core/supplemental/likelySubtags.json
fn chinese_script_of(tag: &str) -> Option<&'static str> {
    if language(tag) != "zh" || script(tag).is_some() {
        return None;
    }
    match region(tag)? {
        "TW" | "HK" | "MO" => Some("zh-Hant"),
        "CN" | "SG" => Some("zh-Hans"),
        _ => None,
    }
}

fn is_script(subtag: &str) -> bool {
    subtag.len() == 4 && subtag.bytes().all(|byte| byte.is_ascii_alphabetic())
}

fn is_region(subtag: &str) -> bool {
    subtag.len() == 2 && subtag.bytes().all(|byte| byte.is_ascii_alphabetic())
}

fn title_case(subtag: &str) -> String {
    let (first, rest) = subtag.split_at(1);
    first.to_ascii_uppercase() + &rest.to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    const OFFERED: &[&str] = &["en", "fr", "fr-CH", "pt-BR", "zh-Hans", "zh-Hant"];

    #[test]
    fn a_tag_is_respelled_the_way_bcp_47_writes_it() {
        assert_eq!(canonical("fr-ch"), "fr-CH");
        assert_eq!(canonical("PT_br"), "pt-BR");
        assert_eq!(canonical("ZH_hant_tw"), "zh-Hant-TW");
        assert_eq!(canonical(" en "), "en");
    }

    #[test]
    fn a_region_is_read_past_a_script_and_a_script_is_not_a_region() {
        assert_eq!(region("zh-Hant-TW"), Some("TW"));
        assert_eq!(region("pt_BR"), Some("BR"));
        assert_eq!(region("zh-Hant"), None);
        assert_eq!(region("fr"), None);
        assert_eq!(script("zh-Hant-TW"), Some("Hant"));
        assert_eq!(script("pt-BR"), None);
    }

    #[test]
    fn a_tag_belongs_to_every_shorter_tag_nearest_first() {
        assert_eq!(parents("zh-Hant-TW").collect::<Vec<_>>(), ["zh-Hant", "zh"]);
        assert_eq!(parents("fr").count(), 0);
    }

    #[test]
    fn a_tag_spelled_loosely_names_the_regional_locale_and_not_its_language() {
        assert_eq!(nearest("fr-ch", OFFERED), Some("fr-CH"));
        assert_eq!(nearest("PT_br", OFFERED), Some("pt-BR"));
    }

    #[test]
    fn a_chinese_region_names_the_script_it_writes_in() {
        assert_eq!(nearest("zh-TW", OFFERED), Some("zh-Hant"));
        assert_eq!(nearest("zh-HK", OFFERED), Some("zh-Hant"));
        assert_eq!(nearest("zh_mo", OFFERED), Some("zh-Hant"));
        assert_eq!(nearest("zh-CN", OFFERED), Some("zh-Hans"));
        assert_eq!(nearest("zh-SG", OFFERED), Some("zh-Hans"));
    }

    #[test]
    fn a_region_nobody_offers_names_the_language_it_belongs_to() {
        assert_eq!(nearest("fr-BE", OFFERED), Some("fr"));
        assert_eq!(nearest("zh-Hant-HK", OFFERED), Some("zh-Hant"));
    }

    #[test]
    fn a_language_offered_only_as_a_region_is_left_to_the_caller() {
        assert_eq!(nearest("pt", OFFERED), None);
        assert_eq!(nearest("zh-TW", &["zh-Hans"]), None);
        assert_eq!(nearest("de", OFFERED), None);
        assert_eq!(nearest("", OFFERED), None);
    }
}
