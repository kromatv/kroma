//! The info hash inside a magnet URI, which is how a grab and a stored download
//! row are matched to what an engine is actually running.

pub fn magnet_info_hash(uri: &str) -> Option<String> {
    let lower = uri.to_ascii_lowercase();
    let idx = lower.find("xt=urn:btih:")?;
    let hash: String = lower[idx + "xt=urn:btih:".len()..]
        .chars()
        .take_while(char::is_ascii_alphanumeric)
        .collect();
    // 40-char hex (v1) or 32-char base32.
    (hash.len() == 40 || hash.len() == 32).then_some(hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn magnet_info_hash_v1_hex() {
        let uri = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=movie";
        assert_eq!(
            magnet_info_hash(uri).as_deref(),
            Some("0123456789abcdef0123456789abcdef01234567")
        );
    }

    #[test]
    fn magnet_info_hash_is_case_insensitive() {
        // The scheme + hash are upper-cased; the result is normalized to lowercase.
        let uri = "MAGNET:?XT=URN:BTIH:0123456789ABCDEF0123456789ABCDEF01234567";
        assert_eq!(
            magnet_info_hash(uri).as_deref(),
            Some("0123456789abcdef0123456789abcdef01234567")
        );
    }

    #[test]
    fn magnet_info_hash_base32_len_32() {
        let uri = "magnet:?xt=urn:btih:abcdefghijklmnopqrstuvwxyz234567";
        assert_eq!(
            magnet_info_hash(uri).as_deref(),
            Some("abcdefghijklmnopqrstuvwxyz234567")
        );
    }

    #[test]
    fn magnet_info_hash_rejects_bad_input() {
        // No xt parameter.
        assert_eq!(magnet_info_hash("magnet:?dn=nothing"), None);
        assert_eq!(magnet_info_hash(""), None);
        // Wrong length (neither 40 nor 32).
        assert_eq!(magnet_info_hash("magnet:?xt=urn:btih:deadbeef"), None);
        // Stops at the first non-alphanumeric, leaving an invalid length.
        assert_eq!(magnet_info_hash("magnet:?xt=urn:btih:-&dn=x"), None);
    }
}
