use super::language;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Marks {
    pub language: Option<&'static str>,
    pub forced: bool,
    pub hearing_impaired: bool,
}

pub fn title_of(forced: bool, hearing_impaired: bool) -> Option<String> {
    let words: Vec<&str> = [(forced, "Forced"), (hearing_impaired, "SDH")]
        .into_iter()
        .filter_map(|(set, word)| set.then_some(word))
        .collect();
    (!words.is_empty()).then(|| words.join(" · "))
}

const FORCED: &[&str] = &["forced", "force", "forcé", "forcée", "forces", "forcés"];
const HEARING_IMPAIRED: &[&str] = &[
    "sdh",
    "cc",
    "impaired",
    "malentendants",
    "sourds",
    "hearingimpaired",
];

/// `hi` is Hindi on its own and hearing-impaired once another language has been
/// named, which is the only spelling a subtitle file uses it in.
pub fn marks_of(tail: &str) -> Marks {
    let mut marks = Marks::default();
    for word in tail.split(['.', '-', '_', ' ', '(', ')', '[', ']']) {
        let lowered = word.to_lowercase();
        if FORCED.contains(&lowered.as_str()) {
            marks.forced = true;
        } else if HEARING_IMPAIRED.contains(&lowered.as_str())
            || (lowered == "hi" && marks.language.is_some())
        {
            marks.hearing_impaired = true;
        } else if marks.language.is_none() {
            marks.language = language::code_of(word);
        }
    }
    marks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_that_says_only_a_language_says_nothing_else() {
        let marks = marks_of(".en");

        assert_eq!(
            marks,
            Marks {
                language: Some("en"),
                forced: false,
                hearing_impaired: false,
            }
        );
        assert_eq!(title_of(marks.forced, marks.hearing_impaired), None);
    }

    #[test]
    fn a_forced_track_is_read_in_english_and_in_french() {
        assert!(marks_of(".fr.forced").forced);
        assert!(marks_of(".fr.forcés").forced);
    }

    #[test]
    fn every_spelling_of_a_track_for_the_deaf_reads_as_one() {
        let spellings = [".en.sdh", ".en.cc", ".en.hi", ".en.hearing-impaired"];

        assert!(spellings.iter().all(|tail| marks_of(tail).hearing_impaired));
    }

    #[test]
    fn hindi_on_its_own_is_a_language_and_not_a_track_for_the_deaf() {
        let marks = marks_of(".hi");

        assert_eq!(marks.language, Some("hi"));
        assert!(!marks.hearing_impaired);
    }

    #[test]
    fn a_name_flagging_both_titles_the_track_with_both() {
        let marks = marks_of(".fr.forced.sdh");

        assert_eq!(
            title_of(marks.forced, marks.hearing_impaired).unwrap(),
            "Forced · SDH"
        );
    }

    #[test]
    fn a_numbered_track_out_of_a_subs_folder_reads_its_language() {
        assert_eq!(marks_of("2_English").language, Some("en"));
        assert_eq!(marks_of("3_French.forced").language, Some("fr"));
    }

    #[test]
    fn a_name_that_says_nothing_says_nothing() {
        assert_eq!(marks_of(""), Marks::default());
    }
}
