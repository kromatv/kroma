// Every Latin letter whose NFD form is an ASCII letter plus combining marks,
// which is the set the TypeScript side folds by decomposing. Generated over
// Latin-1, Extended-A/B and Extended Additional, so the Vietnamese vowels and
// the dotted-below transliteration letters fold here too rather than becoming
// separators on this side only. A letter with no
// such decomposition (`ß`, `æ`, `ø`, `ð`, `ł`) is NOT here: both sides turn it
// into a separator, and `slug.fixture.json` holds them to that.
const LATIN_FOLD: [(&str, char); 25] = [
    ("àáâãäåāăąǎǟǡǻȁȃȧḁạảấầẩẫậắằẳẵặ", 'a'),
    ("ḃḅḇ", 'b'),
    ("çćĉċčḉ", 'c'),
    ("ďḋḍḏḑḓ", 'd'),
    ("èéêëēĕėęěȅȇȩḕḗḙḛḝẹẻẽếềểễệ", 'e'),
    ("ḟ", 'f'),
    ("ĝğġģǧǵḡ", 'g'),
    ("ĥȟḣḥḧḩḫẖ", 'h'),
    ("ìíîïĩīĭįǐȉȋḭḯỉị", 'i'),
    ("ĵǰ", 'j'),
    ("ķǩḱḳḵ", 'k'),
    ("ĺļľḷḹḻḽ", 'l'),
    ("ḿṁṃ", 'm'),
    ("ñńņňǹṅṇṉṋ", 'n'),
    ("òóôõöōŏőơǒǫǭȍȏȫȭȯȱṍṏṑṓọỏốồổỗộớờởỡợ", 'o'),
    ("ṕṗ", 'p'),
    ("ŕŗřȑȓṙṛṝṟ", 'r'),
    ("śŝşšșṡṣṥṧṩ", 's'),
    ("ţťțṫṭṯṱẗ", 't'),
    ("ùúûüũūŭůűųưǔǖǘǚǜȕȗṳṵṷṹṻụủứừửữự", 'u'),
    ("ṽṿ", 'v'),
    ("ŵẁẃẅẇẉẘ", 'w'),
    ("ẋẍ", 'x'),
    ("ýÿŷȳẏẙỳỵỷỹ", 'y'),
    ("źżžẑẓẕ", 'z'),
];

/// The URL segment a display name folds to: lowercased, accents dropped, every
/// run of anything else turned into one `-`, with no leading or trailing one.
/// Idempotent.
pub fn slugify(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars().flat_map(char::to_lowercase) {
        if is_combining_mark(ch) {
            continue;
        }
        match base_letter(ch) {
            Some(base) => out.push(base),
            None if !out.is_empty() && !out.ends_with('-') => out.push('-'),
            None => {}
        }
    }
    out.trim_end_matches('-').to_string()
}

/// Whether `raw` slugifies to `slug`, without building the slug. The credit
/// scan asks this of every name in the library, so the allocation slugify makes
/// per call is the cost being avoided rather than a micro-optimisation.
pub fn slug_eq(raw: &str, slug: &str) -> bool {
    let mut want = slug.chars();
    let mut pending_separator = false;
    let mut any = false;
    for ch in raw.chars().flat_map(char::to_lowercase) {
        if is_combining_mark(ch) {
            continue;
        }
        match base_letter(ch) {
            Some(base) => {
                if pending_separator {
                    if want.next() != Some('-') {
                        return false;
                    }
                    pending_separator = false;
                }
                if want.next() != Some(base) {
                    return false;
                }
                any = true;
            }
            // A run of anything else is one separator, and a trailing run is
            // none at all: the same shape `slugify` produces.
            None if any => pending_separator = true,
            None => {}
        }
    }
    want.next().is_none()
}

fn is_combining_mark(ch: char) -> bool {
    matches!(ch, '\u{0300}'..='\u{036F}')
}

fn base_letter(ch: char) -> Option<char> {
    if ch.is_ascii_alphanumeric() {
        return Some(ch);
    }
    LATIN_FOLD
        .iter()
        .find(|(accented, _)| accented.contains(ch))
        .map(|&(_, base)| base)
}

#[cfg(test)]
mod tests {
    use super::*;

    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Case {
        name: String,
        slug: String,
    }

    const SHARED_CASES: &str = include_str!("../../../../packages/core/src/slug.fixture.json");

    fn shared_cases() -> Vec<Case> {
        serde_json::from_str(SHARED_CASES).expect("slug.fixture.json is not the expected shape")
    }

    #[test]
    fn every_shared_case_folds_the_way_the_typescript_slugifier_folds_it() {
        for Case { name, slug } in shared_cases() {
            assert_eq!(slugify(&name), slug, "folding {name:?}");
        }
    }

    #[test]
    fn slug_eq_answers_for_every_shared_case_what_slugify_would_have_built() {
        for Case { name, slug } in shared_cases() {
            assert!(slug_eq(&name, &slug), "{name:?} should equal {slug:?}");
            assert!(!slug_eq(&name, &format!("{slug}x")), "{name:?} vs a longer slug");
            if !slug.is_empty() {
                assert!(
                    !slug_eq(&name, &slug[..slug.len() - 1]),
                    "{name:?} vs a shorter slug"
                );
            }
        }
    }

    #[test]
    fn slug_eq_reads_a_separator_run_and_a_trailing_run_as_slugify_does() {
        assert!(slug_eq("Ana  de  Armas", "ana-de-armas"));
        assert!(slug_eq("Sammy Davis Jr.", "sammy-davis-jr"));
        assert!(slug_eq("  Michelle Yeoh  ", "michelle-yeoh"));
        assert!(!slug_eq("Ana de Armas", "ana--de-armas"));
        assert!(!slug_eq("Sammy Davis Jr.", "sammy-davis-jr-"));
    }

    #[test]
    fn a_slug_read_back_off_a_url_folds_to_itself() {
        for Case { slug, .. } in shared_cases() {
            assert_eq!(slugify(&slug), slug);
        }
    }

    #[test]
    fn two_spellings_of_one_name_fold_together_and_two_names_stay_apart() {
        assert_eq!(
            slugify("  DENIS   villeneuve "),
            slugify("Denis Villeneuve")
        );
        assert_ne!(slugify("Conan O'Brien"), slugify("Conan OBrien"));
    }
}
