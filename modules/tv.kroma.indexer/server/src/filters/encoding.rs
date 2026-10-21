pub(super) fn query_param(value: &str, key: &str) -> String {
    let query = value.split_once('?').map(|(_, q)| q).unwrap_or(value);
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return url_decode(v);
            }
        }
    }
    String::new()
}

pub(super) fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Percent-encode (RFC 3986 unreserved). `pub(crate)` so the session layer's
/// form/query encoding shares one implementation.
pub(crate) fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub(super) fn html_decode(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        if let Some(semi) = rest.find(';').filter(|&i| i <= 10) {
            let entity = &rest[1..semi];
            let decoded = match entity {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some('\u{00a0}'),
                e if e.starts_with("#x") || e.starts_with("#X") => u32::from_str_radix(&e[2..], 16)
                    .ok()
                    .and_then(char::from_u32),
                e if e.starts_with('#') => e[1..].parse::<u32>().ok().and_then(char::from_u32),
                _ => None,
            };
            match decoded {
                Some(c) => {
                    out.push(c);
                    rest = &rest[semi + 1..];
                }
                None => {
                    out.push('&');
                    rest = &rest[1..];
                }
            }
        } else {
            out.push('&');
            rest = &rest[1..];
        }
    }
    out.push_str(rest);
    out
}

pub(super) fn html_encode(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use crate::filters::tests::{f, run};

    #[test]
    fn url_and_html() {
        assert_eq!(run("a%20b%2Fc", &[f("urldecode", &[])]), "a b/c");
        assert_eq!(run("a b/c", &[f("urlencode", &[])]), "a%20b%2Fc");
        assert_eq!(
            run("Tom &amp; Jerry &#39;s", &[f("htmldecode", &[])]),
            "Tom & Jerry 's"
        );
    }

    #[test]
    fn querystring_filter() {
        assert_eq!(
            run("https://x/dl?id=99&k=v", &[f("querystring", &["id"])]),
            "99"
        );
    }

    #[test]
    fn querystring_returns_empty_when_the_key_is_absent() {
        assert_eq!(
            run("https://x/dl?id=99&k=v", &[f("querystring", &["missing"])]),
            ""
        );
        assert_eq!(run("https://x/dl", &[f("querystring", &["id"])]), "");
    }

    #[test]
    fn html_encode_escapes_entities() {
        assert_eq!(
            run("1 < 2 & 3", &[f("htmlencode", &[])]),
            "1 &lt; 2 &amp; 3"
        );
        assert_eq!(
            run("say \"hi\"", &[f("htmlencode", &[])]),
            "say &quot;hi&quot;"
        );
    }

    #[test]
    fn html_decode_hex_and_unknown_entities() {
        // Hex numeric entity decodes.
        assert_eq!(run("&#x41;&#x42;", &[f("htmldecode", &[])]), "AB");
        // An unknown entity is left verbatim (never dropped).
        assert_eq!(run("&foo;bar", &[f("htmldecode", &[])]), "&foo;bar");
        // A bare ampersand with no terminating `;` stays literal.
        assert_eq!(run("Tom & Jerry", &[f("htmldecode", &[])]), "Tom & Jerry");
    }

    #[test]
    fn url_decode_plus_and_malformed_escapes() {
        // `+` decodes to a space.
        assert_eq!(run("a+b+c", &[f("urldecode", &[])]), "a b c");
        // A malformed `%zz` escape is passed through byte-for-byte.
        assert_eq!(run("a%zzb", &[f("urldecode", &[])]), "a%zzb");
    }

    #[test]
    fn querystring_no_match_and_no_question_mark() {
        // A missing key yields empty.
        assert_eq!(
            run("https://x/dl?id=99", &[f("querystring", &["missing"])]),
            ""
        );
        // A bare `k=v&...` (no `?`) is treated as the query itself.
        assert_eq!(run("id=5&k=v", &[f("querystring", &["k"])]), "v");
    }
}
