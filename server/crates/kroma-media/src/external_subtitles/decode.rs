// CP1252's own 0x80..=0x9F, which Latin-1 leaves as controls. The five WHATWG
// leaves unassigned keep their Latin-1 code point.
const WINDOWS_1252_HIGH: [char; 32] = [
    '\u{20AC}', '\u{0081}', '\u{201A}', '\u{0192}', '\u{201E}', '\u{2026}', '\u{2020}', '\u{2021}',
    '\u{02C6}', '\u{2030}', '\u{0160}', '\u{2039}', '\u{0152}', '\u{008D}', '\u{017D}', '\u{008F}',
    '\u{0090}', '\u{2018}', '\u{2019}', '\u{201C}', '\u{201D}', '\u{2022}', '\u{2013}', '\u{2014}',
    '\u{02DC}', '\u{2122}', '\u{0161}', '\u{203A}', '\u{0153}', '\u{009D}', '\u{017E}', '\u{0178}',
];

pub fn text_of(bytes: &[u8]) -> String {
    match bytes {
        [0xEF, 0xBB, 0xBF, rest @ ..] => String::from_utf8_lossy(rest).into_owned(),
        [0xFF, 0xFE, rest @ ..] => utf16(rest, u16::from_le_bytes),
        [0xFE, 0xFF, rest @ ..] => utf16(rest, u16::from_be_bytes),
        _ => match std::str::from_utf8(bytes) {
            Ok(text) => text.to_string(),
            Err(_) => windows_1252(bytes),
        },
    }
}

fn utf16(bytes: &[u8], unit: fn([u8; 2]) -> u16) -> String {
    let (pairs, _) = bytes.as_chunks::<2>();
    let units: Vec<u16> = pairs.iter().copied().map(unit).collect();
    String::from_utf16_lossy(&units)
}

fn windows_1252(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|&byte| match byte {
            0x80..=0x9F => WINDOWS_1252_HIGH[usize::from(byte - 0x80)],
            _ => char::from(byte),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_utf8_is_read_as_it_is() {
        assert_eq!(text_of("Déjà vu".as_bytes()), "Déjà vu");
    }

    #[test]
    fn a_byte_order_mark_never_reaches_the_first_cue() {
        let marked = [b"\xEF\xBB\xBF".as_slice(), b"WEBVTT"].concat();

        assert_eq!(text_of(&marked), "WEBVTT");
    }

    #[test]
    fn a_french_subtitle_saved_by_windows_keeps_its_accents() {
        let cp1252 = b"Il \xE9tait d\xE9j\xE0 l\xE0, na\xEFvement";

        assert_eq!(text_of(cp1252), "Il était déjà là, naïvement");
    }

    #[test]
    fn a_typographic_quote_out_of_the_windows_page_is_not_a_control_character() {
        let cp1252 = b"\x93Bonjour\x94 \x85 \x80";

        assert_eq!(text_of(cp1252), "“Bonjour” … €");
    }

    #[test]
    fn utf16_is_read_from_either_end() {
        let little = [b"\xFF\xFE".as_slice(), b"h\x00i\x00"].concat();
        let big = [b"\xFE\xFF".as_slice(), b"\x00h\x00i"].concat();

        assert_eq!(text_of(&little), "hi");
        assert_eq!(text_of(&big), "hi");
    }

    #[test]
    fn nothing_reads_as_nothing() {
        assert_eq!(text_of(b""), "");
    }
}
