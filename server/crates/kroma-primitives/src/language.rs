//! Language codes as releases and media files write them.

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

/// The ISO 639-1 code a word names: a code in either ISO spelling, or an
/// English or French language name (`fre`, `deu`, `Français`, `english`).
pub fn language_code(word: &str) -> Option<&'static str> {
    let base = word.split(['-', '_']).next().unwrap_or(word);
    let lowered = base.to_lowercase();
    LANGUAGES
        .iter()
        .find(|(code, spellings)| *code == lowered || spellings.contains(&lowered.as_str()))
        .map(|(code, _)| *code)
}

// The words a track title uses to say which dub it is: `VFQ` and `Québécois`
// are the Québec French dub, `VFF` and `TrueFrench` the France one.
const DUB_REGIONS: &[(&str, &[&str])] = &[
    (
        "CA",
        &[
            "vfq", "vq", "quebec", "québec", "quebecois", "québécois", "canada", "canadian",
            "canadien",
        ],
    ),
    ("FR", &["vff", "vfi", "truefrench", "france", "parisian", "parisien"]),
    ("BE", &["belgique", "belgian", "belge"]),
    ("CH", &["suisse", "swiss"]),
];

/// The region a track title names for its dub (`VFQ 5.1` is `CA`).
pub fn dub_region(title: &str) -> Option<&'static str> {
    title
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .find_map(|word| {
            DUB_REGIONS
                .iter()
                .find(|(_, words)| words.contains(&word.as_str()))
                .map(|(region, _)| *region)
        })
}

/// The region of a spoken track, from its language tag when the file carries
/// one (`fr-CA`), else from the words of its title.
pub fn track_region(language: Option<&str>, title: Option<&str>) -> Option<String> {
    let tagged = language
        .and_then(|tag| tag.split(['-', '_']).nth(1))
        .filter(|region| region.len() == 2 && region.chars().all(|c| c.is_ascii_alphabetic()))
        .map(str::to_ascii_uppercase);
    tagged.or_else(|| title.and_then(dub_region).map(str::to_string))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_iso_spellings_and_names_resolve_to_one_code() {
        assert_eq!(language_code("fre"), Some("fr"));
        assert_eq!(language_code("fra"), Some("fr"));
        assert_eq!(language_code("Français"), Some("fr"));
        assert_eq!(language_code("fr-CA"), Some("fr"));
        assert_eq!(language_code("klingon"), None);
    }

    #[test]
    fn a_title_names_the_dub_it_is() {
        assert_eq!(dub_region("VFQ 5.1"), Some("CA"));
        assert_eq!(dub_region("Français (Québec)"), Some("CA"));
        assert_eq!(dub_region("French - VFF"), Some("FR"));
        assert_eq!(dub_region("TrueFrench AC3"), Some("FR"));
        assert_eq!(dub_region("Français"), None);
    }

    #[test]
    fn a_language_tag_wins_over_the_title() {
        assert_eq!(track_region(Some("fr-CA"), Some("VFF")).as_deref(), Some("CA"));
        assert_eq!(track_region(Some("fre"), Some("VFQ")).as_deref(), Some("CA"));
        assert_eq!(track_region(Some("fre"), None), None);
        assert_eq!(track_region(Some("en-gb"), None).as_deref(), Some("GB"));
    }
}
