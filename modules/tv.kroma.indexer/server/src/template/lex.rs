#[derive(Debug)]
pub(super) enum Chunk {
    Text(String),
    Action(String),
}

pub(super) fn lex(input: &str) -> Vec<Chunk> {
    let bytes = input.as_bytes();
    let mut chunks = Vec::new();
    let mut i = 0;
    let mut text = String::new();
    while i < bytes.len() {
        if bytes[i] == b'{' && i + 1 < bytes.len() && bytes[i + 1] == b'{' {
            match lex_action(input, bytes, i, &mut text, &mut chunks) {
                Some(next) => {
                    i = next;
                    continue;
                }
                None => break,
            }
        }
        let ch_len = utf8_len(bytes[i]);
        text.push_str(&input[i..i + ch_len]);
        i += ch_len;
    }
    if !text.is_empty() {
        chunks.push(Chunk::Text(text));
    }
    chunks
}

// Lexes a single `{{ … }}` action starting at the opening `{{` (index `i`),
// flushing any pending `text` and appending the action chunk. Returns the
// index just past the action to continue from, or `None` when there is no
// closing `}}` (the caller should stop).
fn lex_action(
    input: &str,
    bytes: &[u8],
    i: usize,
    text: &mut String,
    chunks: &mut Vec<Chunk>,
) -> Option<usize> {
    // Whitespace-trim marker `{{-` trims trailing text whitespace.
    let mut j = i + 2;
    if bytes.get(j) == Some(&b'-') {
        j += 1;
        let trimmed = text.trim_end().len();
        text.truncate(trimmed);
    }
    if !text.is_empty() {
        chunks.push(Chunk::Text(std::mem::take(text)));
    }
    let Some(rel) = input[j..].find("}}") else {
        // No close: treat the rest as literal text.
        text.push_str(&input[i..]);
        return None;
    };
    let mut body = &input[j..j + rel];
    let mut next = j + rel + 2;
    // `-}}` trims leading whitespace of the following text.
    if body.ends_with('-') {
        body = &body[..body.len() - 1];
        while next < bytes.len() && bytes[next].is_ascii_whitespace() {
            next += 1;
        }
    }
    chunks.push(Chunk::Action(body.trim().to_string()));
    Some(next)
}

fn utf8_len(b: u8) -> usize {
    match b {
        0x00..=0x7f => 1,
        0xc0..=0xdf => 2,
        0xe0..=0xef => 3,
        _ => 4,
    }
}

#[cfg(test)]
mod tests {
    use super::super::render;
    use super::super::test_support::{ctx, unchanged};

    #[test]
    fn whitespace_trim_markers() {
        assert_eq!(render("a {{- \"b\" }}", &ctx()), "ab");
        assert_eq!(render("{{ \"a\" -}} b", &ctx()), "ab");
    }


    #[test]
    fn a_multibyte_template_is_not_split_mid_character() {
        // Definitions carry accented and CJK literals. The lexer advances by
        // UTF-8 length on purpose: slicing mid-character would panic.
        let c = ctx();
        assert_eq!(render("&q=Téléchargé", &c), "&q=Téléchargé");
        assert_eq!(render("&q=ダウンロード", &c), "&q=ダウンロード");
        // ...including around an action.
        assert_eq!(render("é{{ .Keywords }}é", &c), "éthe matrix 1999é");
        // ...and inside a broken one, where the fallback returns the source.
        unchanged("é{{ if .Config.freeleech }}é");
    }

    #[test]
    fn a_template_with_no_actions_at_all_is_passed_straight_through() {
        let c = ctx();
        assert_eq!(render("", &c), "");
        assert_eq!(render("/browse.php?x=1", &c), "/browse.php?x=1");
        // A lone brace is text, not the start of an action.
        assert_eq!(render("a{b}c", &c), "a{b}c");
    }


    #[test]
    fn a_four_byte_character_is_not_split_mid_character() {
        let c = ctx();
        assert_eq!(render("&q=𠜎", &c), "&q=𠜎");
        assert_eq!(render("𠜎{{ .Keywords }}𠜎", &c), "𠜎the matrix 1999𠜎");
    }

}
