//! Reading a magnet link.

const BTIH: &str = "urn:btih:";
const BTMH_SHA256: &str = "urn:btmh:1220";
const HASH_BYTES: usize = 20;
const HEX_LEN: usize = HASH_BYTES * 2;
const BASE32_LEN: usize = 32;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct Magnet {
    pub info_hash: Option<[u8; HASH_BYTES]>,
    pub trackers: Vec<String>,
}

impl Magnet {
    /// The info hash as the engine writes it, in lowercase hex.
    pub fn hex_hash(&self) -> Option<String> {
        self.info_hash.as_ref().map(|hash| to_hex(hash))
    }
}

/// `None` for anything that is not a magnet naming a hash.
pub(crate) fn parse(uri: &str) -> Option<Magnet> {
    let (scheme, query) = uri.split_once(":?")?;
    if !scheme.eq_ignore_ascii_case("magnet") {
        return None;
    }
    let mut magnet = Magnet::default();
    let mut named_a_hash = false;
    for (key, value) in form_urlencoded::parse(query.as_bytes()) {
        match key.as_ref() {
            "xt" => {
                if let Some(hash) = value.strip_prefix(BTIH) {
                    magnet.info_hash = Some(decode_hash(hash)?);
                } else if !value.starts_with(BTMH_SHA256) {
                    return None;
                }
                named_a_hash = true;
            }
            "tr" => magnet.trackers.push(value.into_owned()),
            _ => {}
        }
    }
    named_a_hash.then_some(magnet)
}

pub(crate) fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode_hash(text: &str) -> Option<[u8; HASH_BYTES]> {
    match text.len() {
        HEX_LEN => from_hex(text),
        BASE32_LEN => from_base32(text),
        _ => None,
    }
}

fn from_hex(text: &str) -> Option<[u8; HASH_BYTES]> {
    let mut out = [0_u8; HASH_BYTES];
    for (slot, pair) in out.iter_mut().zip(text.as_bytes().as_chunks::<2>().0) {
        *slot = u8::from_str_radix(std::str::from_utf8(pair).ok()?, 16).ok()?;
    }
    Some(out)
}

fn from_base32(text: &str) -> Option<[u8; HASH_BYTES]> {
    let mut out = [0_u8; HASH_BYTES];
    let (mut buffer, mut bits, mut written) = (0_u32, 0_u32, 0_usize);
    for byte in text.bytes() {
        let digit = match byte.to_ascii_uppercase() {
            letter @ b'A'..=b'Z' => letter - b'A',
            number @ b'2'..=b'7' => number - b'2' + 26,
            _ => return None,
        };
        buffer = (buffer << 5) | u32::from(digit);
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            *out.get_mut(written)? = (buffer >> bits) as u8;
            buffer &= (1 << bits) - 1;
            written += 1;
        }
    }
    (written == HASH_BYTES).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEX: &str = "cfe1119f124881ca70f7306f32e292194c88c195";

    #[test]
    fn a_hex_hash_and_a_percent_encoded_tracker_are_read() {
        let link = format!("magnet:?xt=urn:btih:{HEX}&dn=Thing&tr=http%3A%2F%2Ft.invalid%2Fa");

        let magnet = parse(&link).unwrap();

        assert_eq!(magnet.hex_hash().as_deref(), Some(HEX));
        assert_eq!(magnet.trackers, ["http://t.invalid/a"]);
    }

    #[test]
    fn a_base32_hash_reads_as_the_same_hash_in_either_case() {
        let upper = parse("magnet:?xt=urn:btih:Z7QRDHYSJCA4U4HXGBXTFYUSDFGIRQMV").unwrap();
        let lower = parse("magnet:?xt=urn:btih:z7qrdhysjca4u4hxgbxtfyusdfgirqmv").unwrap();

        assert_eq!(upper.hex_hash().as_deref(), Some(HEX));
        assert_eq!(lower, upper);
    }

    #[test]
    fn a_v2_only_link_is_a_magnet_with_no_sha1_hash() {
        let link = format!("magnet:?xt=urn:btmh:1220{}", "ab".repeat(32));

        assert_eq!(parse(&link).unwrap().info_hash, None);
    }

    #[test]
    fn anything_else_is_not_a_magnet() {
        for refused in [
            "not a magnet",
            "https://example.com/?xt=urn:btih:abc",
            "magnet:?dn=no-hash-here",
            "magnet:?xt=urn:btih:deadbeef",
            "magnet:?xt=urn:other:deadbeef",
        ] {
            assert_eq!(parse(refused), None, "{refused}");
        }
    }
}
