pub use kroma_primitives::language::language_code as code_of;

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
