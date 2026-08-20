//! The title spellings a template can ask for: Radarr's CleanTitle, the
//! article-last sort form, and the bucket letter a sort title falls under.

// Radarr's CleanTitle: drop apostrophes/quotes and turn the punctuation that
// would clutter a filename into spaces, keeping the words.
pub(super) fn clean_title(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    for c in title.chars() {
        match c {
            '\'' | '"' | '`' | '\u{2019}' | '\u{2018}' => {} // dropped, no gap
            ',' | ':' | ';' | '!' | '?' | '.' | '*' | '|' | '<' | '>' | '/' | '\\' => out.push(' '),
            c => out.push(c),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

// "The Matrix" -> "Matrix, The"; titles without a leading article are left
// unchanged.
pub(super) fn title_the(title: &str) -> String {
    for article in ["The ", "A ", "An "] {
        if let Some(rest) = title.strip_prefix(article) {
            return format!("{}, {}", rest.trim_start(), article.trim_end());
        }
    }
    title.to_string()
}

// The first alphanumeric character of the sort title, upper-cased (for
// `A/`, `B/`, `0/` folder buckets).
pub(super) fn first_character(title: &str) -> String {
    title_the(title)
        .chars()
        .find(|c| c.is_alphanumeric())
        .map(|c| c.to_uppercase().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_title_and_the() {
        assert_eq!(clean_title("Mission: Impossible"), "Mission Impossible");
        assert_eq!(clean_title("Marvel's Avengers"), "Marvels Avengers");
        assert_eq!(title_the("The Matrix"), "Matrix, The");
        assert_eq!(title_the("A Serious Man"), "Serious Man, A");
        assert_eq!(title_the("Inception"), "Inception");
        assert_eq!(first_character("The Matrix"), "M");
    }

    #[test]
    fn title_the_handles_all_articles() {
        assert_eq!(title_the("An Officer and a Gentleman"), "Officer and a Gentleman, An");
        // No leading article: unchanged.
        assert_eq!(title_the("Blade Runner"), "Blade Runner");
        // First-character bucket uses the sort title (article moved to the end).
        assert_eq!(first_character("A Bug's Life"), "B");
        assert_eq!(first_character("2001: A Space Odyssey"), "2");
        assert_eq!(first_character(""), "");
    }

    #[test]
    fn clean_title_drops_curly_quotes_without_gaps() {
        assert_eq!(clean_title("It\u{2019}s Complicated"), "Its Complicated");
        assert_eq!(clean_title("Who? What! Why."), "Who What Why");
    }
}
