// ISO 639-1 first, then the 639-2/B and /T spellings, then the English and
// French names a release actually writes in a file name. The client normalises
// any of these to its own two-letter base, so the code is what travels.
const LANGUAGES: &[(&str, &[&str])] = &[
    ("ar", &["ara", "arabic", "arabe"]),
    ("bg", &["bul", "bulgarian", "bulgare"]),
    ("ca", &["cat", "catalan", "català"]),
    ("cs", &["cze", "ces", "czech", "tchèque", "tcheque"]),
    ("da", &["dan", "danish", "danois", "dansk"]),
    ("de", &["ger", "deu", "german", "allemand", "deutsch"]),
    ("el", &["gre", "ell", "greek", "grec"]),
    ("en", &["eng", "english", "anglais"]),
    (
        "es",
        &[
            "spa",
            "spanish",
            "espagnol",
            "espanol",
            "español",
            "castellano",
        ],
    ),
    ("et", &["est", "estonian", "estonien"]),
    ("eu", &["baq", "eus", "basque"]),
    ("fa", &["per", "fas", "persian", "persan", "farsi"]),
    ("fi", &["fin", "finnish", "finnois", "suomi"]),
    ("fr", &["fre", "fra", "french", "français", "francais"]),
    ("gl", &["glg", "galician", "galicien"]),
    ("he", &["heb", "hebrew", "hébreu", "hebreu"]),
    ("hi", &["hin", "hindi"]),
    ("hr", &["hrv", "croatian", "croate"]),
    ("hu", &["hun", "hungarian", "hongrois", "magyar"]),
    ("id", &["ind", "indonesian", "indonésien", "indonesien"]),
    ("it", &["ita", "italian", "italien", "italiano"]),
    ("ja", &["jpn", "japanese", "japonais"]),
    ("ko", &["kor", "korean", "coréen", "coreen"]),
    ("lt", &["lit", "lithuanian", "lituanien"]),
    ("lv", &["lav", "latvian", "letton"]),
    ("ms", &["may", "msa", "malay", "malais"]),
    ("nb", &["nob", "bokmal", "bokmål"]),
    (
        "nl",
        &[
            "dut",
            "nld",
            "dutch",
            "néerlandais",
            "neerlandais",
            "nederlands",
        ],
    ),
    (
        "no",
        &["nor", "norwegian", "norvégien", "norvegien", "norsk"],
    ),
    ("pl", &["pol", "polish", "polonais", "polski"]),
    (
        "pt",
        &["por", "portuguese", "portugais", "portugues", "português"],
    ),
    ("ro", &["rum", "ron", "romanian", "roumain"]),
    ("ru", &["rus", "russian", "russe"]),
    ("sk", &["slo", "slk", "slovak", "slovaque"]),
    ("sl", &["slv", "slovenian", "slovène", "slovene"]),
    ("sr", &["srp", "serbian", "serbe"]),
    ("sv", &["swe", "swedish", "suédois", "suedois", "svenska"]),
    ("th", &["tha", "thai", "thaï"]),
    ("tr", &["tur", "turkish", "turc"]),
    ("uk", &["ukr", "ukrainian", "ukrainien"]),
    ("vi", &["vie", "vietnamese", "vietnamien"]),
    (
        "zh",
        &["chi", "zho", "cmn", "chinese", "chinois", "mandarin"],
    ),
];

pub fn code_of(word: &str) -> Option<&'static str> {
    let base = word.split(['-', '_']).next().unwrap_or(word);
    let lowered = base.to_lowercase();
    LANGUAGES
        .iter()
        .find(|(code, spellings)| *code == lowered || spellings.contains(&lowered.as_str()))
        .map(|(code, _)| *code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_two_letter_code_names_itself() {
        assert_eq!(code_of("fr"), Some("fr"));
        assert_eq!(code_of("EN"), Some("en"));
    }

    #[test]
    fn both_three_letter_spellings_of_one_language_agree() {
        assert_eq!(code_of("fre"), Some("fr"));
        assert_eq!(code_of("fra"), Some("fr"));
        assert_eq!(code_of("ger"), Some("de"));
        assert_eq!(code_of("deu"), Some("de"));
    }

    #[test]
    fn a_language_written_out_is_read_in_english_and_in_french() {
        assert_eq!(code_of("English"), Some("en"));
        assert_eq!(code_of("anglais"), Some("en"));
        assert_eq!(code_of("Français"), Some("fr"));
        assert_eq!(code_of("francais"), Some("fr"));
    }

    #[test]
    fn a_region_narrows_nothing_and_is_dropped() {
        assert_eq!(code_of("pt-BR"), Some("pt"));
        assert_eq!(code_of("en_US"), Some("en"));
    }

    #[test]
    fn a_word_that_names_no_language_names_none() {
        assert_eq!(code_of("forced"), None);
        assert_eq!(code_of("2"), None);
        assert_eq!(code_of(""), None);
    }
}
