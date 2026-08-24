//! Folding a title to its comparable form, and how close two of them are.

/// Sorensen-Dice coefficient over the character bigrams of the two normalized
/// titles, in `0.0..=1.0`. Chosen over edit distance because it is length- and
/// word-order-tolerant: a missing subtitle degrades gracefully instead of falling
/// off a cliff, and a transposed word costs far less than it would in Levenshtein.
pub fn similarity(a: &str, b: &str) -> f32 {
    dice(&normalize(a), &normalize(b))
}

// Sorensen-Dice coefficient over two already-normalized strings. Split out from
// [`similarity`] so title scoring can run it over both the article-stripped and
// the article-preserving forms without re-folding.
pub(super) fn dice(a: &str, b: &str) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    if a == b {
        return 1.0;
    }
    let (mut left, right) = (bigrams(a), bigrams(b));
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let total = left.len() + right.len();
    // Consume each match so a repeated bigram cannot be counted twice.
    let mut hits = 0usize;
    for bg in right {
        if let Some(pos) = left.iter().position(|x| *x == bg) {
            left.swap_remove(pos);
            hits += 1;
        }
    }
    (2.0 * hits as f32) / total as f32
}

/// Fold a title to its comparable form: lowercase, accents stripped, every run of
/// punctuation reduced to one space, leading article dropped.
pub fn normalize(raw: &str) -> String {
    strip_article(&normalize_core(raw))
}

// [`normalize`] without dropping a leading article. Used where the article is
// signal rather than noise: telling a literal title match ("Scary Movie") apart
// from one that only holds once the article is stripped ("A Scary Movie").
pub(super) fn normalize_core(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            continue;
        }
        match fold(ch) {
            Some(s) => out.push_str(s),
            // Punctuation / symbols become a separator rather than vanishing, so
            // "spider-man" and "spider man" agree.
            None if !out.ends_with(' ') => out.push(' '),
            None => {}
        }
    }
    out.trim().to_string()
}

// Lowercase + de-accent one non-ASCII-alphanumeric char; `None` for anything
// that is not a letter. Only Latin-1 / Latin-A is folded, which covers every
// language the catalog realistically carries with no unicode dependency.
fn fold(ch: char) -> Option<&'static str> {
    Some(match ch {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' => "a",
        'ç' | 'Ç' => "c",
        'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => "e",
        'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => "i",
        'ñ' | 'Ñ' => "n",
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' | 'Ø' => "o",
        'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => "u",
        'ý' | 'ÿ' | 'Ý' => "y",
        'æ' | 'Æ' => "ae",
        'œ' | 'Œ' => "oe",
        'ß' => "ss",
        // Combining diacritical marks: a decomposed (NFD) accent, e.g. "é" stored
        // as `e` + U+0301. macOS filenames are NFD, so titles parsed from disk
        // carry these. Drop the mark the ASCII base letter already precedes it;
        // without this the mark would fold to a space and split the word.
        '\u{0300}'..='\u{036F}' => "",
        _ => return None,
    })
}

/// Strip decomposed (NFD) combining marks, leaving precomposed accents intact.
/// The lightest touch that makes an NFD title (macOS filenames) searchable: it
/// turns `e` + U+0301 into `e` without otherwise altering case, punctuation or a
/// precomposed `é`. Use it for a provider query where [`normalize`]'s fuller
/// folding (lowercasing, article stripping) would be too lossy.
pub fn strip_combining(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(c, '\u{0300}'..='\u{036F}'))
        .collect()
}

// Articles a catalog title may or may not carry ("The Matrix" vs "Matrix", "Le
// Fabuleux destin..." vs "Fabuleux destin..."). Both sides are normalized first,
// so `l'` is already `l `.
const ARTICLES: [&str; 12] = [
    "the ", "a ", "an ", "le ", "la ", "les ", "l ", "un ", "une ", "der ", "die ", "das ",
];

pub(super) fn strip_article(s: &str) -> String {
    ARTICLES
        .iter()
        .find_map(|art| s.strip_prefix(art))
        .unwrap_or(s)
        .to_string()
}

fn bigrams(s: &str) -> Vec<(char, char)> {
    let chars: Vec<char> = s.chars().collect();
    chars.windows(2).map(|w| (w[0], w[1])).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_latin_accent_and_ligature_folds_to_ascii() {
        assert_eq!(
            normalize("Ångström Ça Ñandú Øst Ünter Ýes"),
            "angstrom ca nandu ost unter yes"
        );
        assert_eq!(normalize("Àáâãä Òóôõöø Ùúûü ÿÝ"), "aaaaa oooooo uuuu yy");
        assert_eq!(normalize("Æon Flux"), "aeon flux");
        assert_eq!(normalize("Œuvre"), "oeuvre");
        assert_eq!(normalize("Straße"), "strasse");
    }

    #[test]
    fn normalize_folds_case_accents_and_punctuation() {
        assert_eq!(normalize("Amélie"), "amelie");
        assert_eq!(
            normalize("Spider-Man: No Way Home"),
            "spider man no way home"
        );
        assert_eq!(normalize("  WALL·E  "), "wall e");
        assert_eq!(normalize("Fast & Furious"), "fast furious");
    }

    #[test]
    fn normalize_drops_a_leading_article() {
        assert_eq!(normalize("The Matrix"), "matrix");
        assert_eq!(normalize("L'Auberge espagnole"), "auberge espagnole");
        // Only a *leading* article, and only as a whole word.
        assert_eq!(normalize("Theodore"), "theodore");
    }

    #[test]
    fn normalize_drops_decomposed_combining_marks() {
        // macOS filenames are NFD: "é" arrives as `e` + U+0301. The mark must be
        // dropped, not folded to a word-splitting space ("de tective").
        assert_eq!(normalize("de\u{0301}tective"), "detective");
        assert_eq!(normalize("Ame\u{0301}lie"), "amelie");
        // Decomposed and precomposed forms fold identically.
        assert_eq!(normalize("Ame\u{0301}lie"), normalize("Amélie"));
    }

    #[test]
    fn strip_combining_removes_marks_but_keeps_precomposed() {
        // NFD "Amélie" (e + U+0301) loses the mark; a precomposed é is untouched.
        assert_eq!(strip_combining("Ame\u{0301}lie"), "Amelie");
        assert_eq!(strip_combining("Amélie"), "Amélie");
        assert_eq!(strip_combining("Ace Ventura"), "Ace Ventura");
    }

    #[test]
    fn similarity_is_one_for_equivalent_titles_and_zero_for_empty() {
        assert_eq!(similarity("The Matrix", "Matrix"), 1.0);
        assert_eq!(similarity("Amélie", "amelie"), 1.0);
        assert_eq!(similarity("", "Matrix"), 0.0);
        // A single-char title has no bigrams; nothing to compare against.
        assert_eq!(similarity("A", "Matrix"), 0.0);
    }

    #[test]
    fn similarity_degrades_gracefully_on_a_missing_subtitle() {
        let s = similarity("Blade Runner", "Blade Runner 2049");
        assert!(s > 0.8, "expected a high partial score, got {s}");
        assert!(s < 1.0);
    }

    #[test]
    fn similarity_is_low_for_unrelated_titles() {
        assert!(similarity("The Matrix", "Frozen") < 0.3);
    }
}
