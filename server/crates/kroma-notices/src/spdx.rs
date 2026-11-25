const TEXTS: [(&str, &str); 4] = [
    ("Apache-2.0", include_str!("../spdx/Apache-2.0.txt")),
    ("LLVM-exception", include_str!("../spdx/LLVM-exception.txt")),
    ("MIT", include_str!("../spdx/MIT.txt")),
    ("MPL-2.0", include_str!("../spdx/MPL-2.0.txt")),
];

const OPERATORS: [&str; 3] = ["AND", "OR", "WITH"];

fn ids(expression: &str) -> Vec<&str> {
    let mut ids: Vec<&str> = Vec::new();
    for token in expression.split(|c: char| c.is_whitespace() || matches!(c, '(' | ')' | '/')) {
        if !token.is_empty() && !OPERATORS.contains(&token) && !ids.contains(&token) {
            ids.push(token);
        }
    }
    ids
}

fn holders(authors: &[String]) -> Option<String> {
    let names: Vec<&str> = authors
        .iter()
        .map(|author| author.split('<').next().unwrap_or_default().trim())
        .filter(|name| !name.is_empty())
        .collect();
    (!names.is_empty()).then(|| format!("Copyright (c) {}", names.join(", ")))
}

fn render(template: &str, holders: Option<&str>) -> String {
    template
        .trim()
        .lines()
        .filter_map(|line| {
            if line.starts_with("Copyright") && line.contains("<copyright holders>") {
                holders
            } else {
                Some(line)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The texts of every license `expression` names, from the SPDX list, with
/// the template's copyright line naming `authors`. `None` when the
/// expression names a license this crate does not carry.
pub fn texts(expression: &str, authors: &[String]) -> Option<Vec<String>> {
    let holders = holders(authors);
    ids(expression)
        .into_iter()
        .map(|id| {
            TEXTS
                .iter()
                .find(|(known, _)| *known == id)
                .map(|(_, template)| render(template, holders.as_deref()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_every_identifier_of_an_expression() {
        let expression = "(MIT OR Apache-2.0) AND MIT WITH LLVM-exception";

        let found = ids(expression);

        assert_eq!(found, vec!["MIT", "Apache-2.0", "LLVM-exception"]);
    }

    #[test]
    fn reads_the_slash_cargo_once_accepted() {
        let expression = "Apache-2.0 / MIT";

        let found = ids(expression);

        assert_eq!(found, vec!["Apache-2.0", "MIT"]);
    }

    #[test]
    fn names_the_authors_on_the_copyright_line() {
        let authors = vec!["Ada Lovelace <ada@example.com>".to_owned(), "Charles Babbage".to_owned()];

        let found = texts("MIT", &authors).unwrap();

        assert!(found[0].contains("\nCopyright (c) Ada Lovelace, Charles Babbage\n"));
        assert!(!found[0].contains("<copyright holders>"));
    }

    #[test]
    fn drops_the_copyright_line_when_no_author_is_known() {
        let found = texts("MIT", &[]).unwrap();

        assert!(!found[0].contains("Copyright"));
    }

    #[test]
    fn carries_a_license_and_its_exception() {
        let found = texts("Apache-2.0 WITH LLVM-exception", &[]).unwrap();

        assert_eq!(found.len(), 2);
        assert!(found[1].contains("LLVM Exceptions"));
    }

    #[test]
    fn refuses_a_license_it_does_not_carry() {
        let found = texts("MIT OR Beerware", &[]);

        assert!(found.is_none());
    }
}
