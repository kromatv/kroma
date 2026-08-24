//! Encoding of one option line in a curl config file.

// Within a double-quoted curl config value only `\\ \" \t \n \r \v` survive as
// escapes; an unescaped newline would end the option and start another one.
pub(crate) fn option_line(name: &str, value: &str) -> String {
    let mut line = String::with_capacity(name.len() + value.len() + 8);
    line.push_str(name);
    line.push_str(" = \"");
    for c in value.chars() {
        match c {
            '\\' => line.push_str("\\\\"),
            '"' => line.push_str("\\\""),
            '\t' => line.push_str("\\t"),
            '\n' => line.push_str("\\n"),
            '\r' => line.push_str("\\r"),
            '\u{b}' => line.push_str("\\v"),
            _ => line.push(c),
        }
    }
    line.push_str("\"\n");
    line
}

// RFC 9110 §5.5 forbids CR and LF in a field value, and curl forwards whatever
// it is handed, so a value carrying one would split the request in two.
pub(crate) fn header_line(name: &str, value: &str) -> String {
    let field: String = format!("{name}: {value}")
        .chars()
        .filter(|c| !matches!(c, '\r' | '\n'))
        .collect();
    option_line("header", &field)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_config_value_escapes_what_would_end_the_option() {
        assert_eq!(
            option_line("header", r#"X: a"b"#),
            "header = \"X: a\\\"b\"\n"
        );
        assert_eq!(option_line("header", r"X: a\b"), "header = \"X: a\\\\b\"\n");
        assert_eq!(
            option_line("url", "a\nb\r\tc\u{b}d"),
            "url = \"a\\nb\\r\\tc\\vd\"\n"
        );
    }
}
