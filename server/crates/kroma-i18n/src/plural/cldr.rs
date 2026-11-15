//! CLDR plural categories for whole counts, for every language a catalog can
//! be translated into. A JavaScript peer picks a variant through
//! `Intl.PluralRules`; whatever this crate renders has to pick the same one,
//! so `cases.txt` holds what ICU answers and the test below reads this table
//! against it.

use super::Category;

const MILLION: u64 = 1_000_000;

fn language(tag: &str) -> &str {
    let end = tag.find(['-', '_']).unwrap_or(tag.len());
    &tag[..end]
}

fn is(tag: &str, codes: &[&str]) -> bool {
    codes.iter().any(|code| language(tag).eq_ignore_ascii_case(code))
}

fn european_portuguese(tag: &str) -> bool {
    tag.len() == 5 && tag[..2].eq_ignore_ascii_case("pt") && tag[3..].eq_ignore_ascii_case("pt")
}

fn one_at_one(n: u64) -> Category {
    if n == 1 {
        Category::One
    } else {
        Category::Other
    }
}

fn many_at_millions(n: u64, singular: bool) -> Category {
    if singular {
        Category::One
    } else if n != 0 && n.is_multiple_of(MILLION) {
        Category::Many
    } else {
        Category::Other
    }
}

fn east_slavic(n: u64) -> Category {
    match (n % 10, n % 100) {
        (1, rest) if rest != 11 => Category::One,
        (2..=4, rest) if !(12..=14).contains(&rest) => Category::Few,
        _ => Category::Many,
    }
}

fn south_slavic(n: u64) -> Category {
    match east_slavic(n) {
        Category::Many => Category::Other,
        category => category,
    }
}

fn polish(n: u64) -> Category {
    match (n, n % 10, n % 100) {
        (1, ..) => Category::One,
        (_, 2..=4, rest) if !(12..=14).contains(&rest) => Category::Few,
        _ => Category::Many,
    }
}

fn arabic(n: u64) -> Category {
    match (n, n % 100) {
        (0, _) => Category::Zero,
        (1, _) => Category::One,
        (2, _) => Category::Two,
        (_, 3..=10) => Category::Few,
        (_, 11..=99) => Category::Many,
        _ => Category::Other,
    }
}

fn welsh(n: u64) -> Category {
    match n {
        0 => Category::Zero,
        1 => Category::One,
        2 => Category::Two,
        3 => Category::Few,
        6 => Category::Many,
        _ => Category::Other,
    }
}

fn irish(n: u64) -> Category {
    match n {
        1 => Category::One,
        2 => Category::Two,
        3..=6 => Category::Few,
        7..=10 => Category::Many,
        _ => Category::Other,
    }
}

fn lithuanian(n: u64) -> Category {
    match (n % 10, n % 100) {
        (_, 11..=19) | (0, _) => Category::Other,
        (1, _) => Category::One,
        _ => Category::Few,
    }
}

fn latvian(n: u64) -> Category {
    match (n % 10, n % 100) {
        (0, _) | (_, 11..=19) => Category::Zero,
        (1, _) => Category::One,
        _ => Category::Other,
    }
}

fn romanian(n: u64) -> Category {
    match (n, n % 100) {
        (1, _) => Category::One,
        (0, _) | (_, 1..=19) => Category::Few,
        _ => Category::Other,
    }
}

fn slovenian(n: u64) -> Category {
    match n % 100 {
        1 => Category::One,
        2 => Category::Two,
        3 | 4 => Category::Few,
        _ => Category::Other,
    }
}

fn filipino(n: u64) -> Category {
    if (1..=3).contains(&n) || !matches!(n % 10, 4 | 6 | 9) {
        Category::One
    } else {
        Category::Other
    }
}

/// The CLDR category a whole `count` falls in for `locale`, however the tag is
/// spelled (`pt-BR`, `pt_br`). A language this table does not know is singular
/// at one and plural elsewhere, which is the commonest rule.
///
/// This is the rule to pass unless you have a reason not to: a JavaScript peer
/// reading the same catalog gets full CLDR from `Intl.PluralRules`, and a
/// server that guesses differently renders a count one way in a notification
/// and another way on screen.
pub fn cldr(locale: &str, count: i64) -> Category {
    let n = count.unsigned_abs();
    if is(locale, &["id", "ja", "km", "ko", "lo", "ms", "my", "th", "vi", "yue", "zh"]) {
        Category::Other
    } else if european_portuguese(locale) || is(locale, &["ca", "es", "it"]) {
        many_at_millions(n, n == 1)
    } else if is(locale, &["fr", "pt"]) {
        many_at_millions(n, n <= 1)
    } else if is(locale, &["am", "bn", "fa", "gu", "hi", "hy", "kn", "pa", "si", "zu"]) {
        one_at_one(n.max(1))
    } else if is(locale, &["be", "ru", "uk"]) {
        east_slavic(n)
    } else if is(locale, &["bs", "hr", "sr"]) {
        south_slavic(n)
    } else if is(locale, &["is", "mk"]) {
        one_at_one(if n % 10 == 1 && n % 100 != 11 { 1 } else { 0 })
    } else if is(locale, &["cs", "sk"]) {
        match n {
            1 => Category::One,
            2..=4 => Category::Few,
            _ => Category::Other,
        }
    } else if is(locale, &["he", "iw"]) {
        match n {
            1 => Category::One,
            2 => Category::Two,
            _ => Category::Other,
        }
    } else if is(locale, &["pl"]) {
        polish(n)
    } else if is(locale, &["ar"]) {
        arabic(n)
    } else if is(locale, &["cy"]) {
        welsh(n)
    } else if is(locale, &["ga"]) {
        irish(n)
    } else if is(locale, &["lt"]) {
        lithuanian(n)
    } else if is(locale, &["lv"]) {
        latvian(n)
    } else if is(locale, &["ro", "mo"]) {
        romanian(n)
    } else if is(locale, &["sl"]) {
        slovenian(n)
    } else if is(locale, &["fil", "tl"]) {
        filipino(n)
    } else {
        one_at_one(n)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CASES: &str = include_str!("cases.txt");

    fn letter(category: Category) -> char {
        match category {
            Category::Zero => 'z',
            Category::One => 'o',
            Category::Two => 't',
            Category::Few => 'f',
            Category::Many => 'm',
            Category::Other => 'x',
        }
    }

    #[test]
    fn every_language_picks_the_category_icu_picks() {
        let mut lines = CASES.lines();
        let counts: Vec<i64> = lines
            .next()
            .and_then(|header| header.strip_prefix("# "))
            .expect("the first line lists the counts")
            .split(',')
            .map(|count| count.parse().expect("a count"))
            .collect();

        let wrong: Vec<String> = lines
            .filter_map(|line| line.split_once(' '))
            .flat_map(|(locale, expected)| {
                counts
                    .iter()
                    .zip(expected.chars())
                    .filter(move |(count, want)| letter(cldr(locale, **count)) != *want)
                    .map(move |(count, want)| format!("{locale} {count}: expected {want}"))
            })
            .collect();

        assert_eq!(wrong, Vec::<String>::new());
    }

    #[test]
    fn a_tag_is_read_however_it_is_spelled() {
        assert_eq!(cldr("fr_CH", 0), Category::One);
        assert_eq!(cldr("PT-br", 0), Category::One);
        assert_eq!(cldr("pt_PT", 0), Category::Other);
        assert_eq!(cldr("ru-RU", 3), Category::Few);
    }

    #[test]
    fn a_language_the_table_does_not_know_is_singular_at_one() {
        assert_eq!(cldr("eo", 1), Category::One);
        assert_eq!(cldr("eo", 0), Category::Other);
    }

    #[test]
    fn a_negative_count_reads_as_its_size() {
        assert_eq!(cldr("ru", -3), cldr("ru", 3));
        assert_eq!(cldr("en", -1), Category::One);
    }
}
