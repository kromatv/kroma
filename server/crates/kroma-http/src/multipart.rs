//! How one `multipart/form-data` part is spelled for curl.

use std::path::Path;

use crate::config::option_line;

/// One part of a `multipart/form-data` body: a literal value, or a file read
/// from disk at send time.
#[derive(Debug, Clone, Copy)]
pub enum FormPart<'a> {
    Text(&'a str),
    File(&'a Path),
}

// `form` reads a leading `@` as a file path and a leading `<` as a file to take
// the value from, so a literal value travels as `form-string`, which reads
// neither. A file name is quoted because `form` splits an unquoted one on `,`
// and `;`.
pub(crate) fn part_line(name: &str, part: FormPart<'_>) -> String {
    match part {
        FormPart::Text(value) => option_line("form-string", &format!("{name}={value}")),
        FormPart::File(path) => option_line("form", &format!("{name}=@\"{}\"", path.display())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_literal_value_is_never_read_as_a_file_path() {
        assert_eq!(
            part_line("mysubmit", FormPart::Text("@/etc/passwd")),
            "form-string = \"mysubmit=@/etc/passwd\"\n"
        );
        assert_eq!(
            part_line("mysubmit", FormPart::Text("Replace")),
            "form-string = \"mysubmit=Replace\"\n"
        );
    }

    #[test]
    fn a_file_part_quotes_the_name_so_a_path_can_carry_a_separator() {
        assert_eq!(
            part_line(
                "archive",
                FormPart::File(Path::new("/data/a;b/channel.zip"))
            ),
            "form = \"archive=@\\\"/data/a;b/channel.zip\\\"\"\n"
        );
    }
}
