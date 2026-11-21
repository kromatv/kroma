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

// RFC 9110 §5.5 allows no control but HTAB in a field value, and curl forwards
// whatever it is handed, so a CR or LF would split the request in two.
pub(crate) fn header_line(name: &str, value: &str) -> String {
    if !is_field_name(name) {
        return String::new();
    }
    let value: String = value
        .chars()
        .filter(|c| !c.is_ascii_control() || *c == '\t')
        .collect();
    option_line("header", &format!("{name}: {value}"))
}

/// Whether `name` is an RFC 9110 field name, a non-empty token. A header whose
/// name is not one is never written: curl reads a header that starts with `@`
/// as a file to send.
pub fn is_field_name(name: &str) -> bool {
    !name.is_empty() && name.bytes().all(is_token_byte)
}

fn is_token_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&byte)
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

    #[test]
    fn a_field_name_is_any_token() {
        assert!(is_field_name("X-Api-Key"));
        assert!(is_field_name("!#$%&'*+-.^_`|~09azAZ"));
    }

    #[test]
    fn a_header_name_that_is_not_a_field_name_writes_no_line() {
        for name in ["@/tmp/x", "x y", "", "a:b", "a/b", "na\u{e9}me"] {
            assert_eq!(header_line(name, "1"), "", "{name:?}");
        }
    }

    #[test]
    fn a_header_value_keeps_a_tab_and_loses_every_other_control() {
        assert_eq!(
            header_line("X-Ok", "a\u{0}b\r\nc"),
            "header = \"X-Ok: abc\"\n"
        );
        assert_eq!(
            header_line("X-Ok", "a\tb\u{7f}"),
            "header = \"X-Ok: a\\tb\"\n"
        );
    }
}
