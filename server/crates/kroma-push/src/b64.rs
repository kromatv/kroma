//! base64url without padding the only encoding Web Push speaks.
//!
//! Every key, secret and salt that crosses the wire (the browser's
//! `PushSubscription`, the VAPID keypair in settings, the JWT segments) is
//! base64url-unpadded, so this is the single place that spelling is decided.

use anyhow::{Context, Result};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;

pub fn encode(bytes: impl AsRef<[u8]>) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Decode base64url, tolerating padding and the standard (`+/`) alphabet.
///
/// Browsers emit unpadded base64url, but subscriptions get copied through
/// config files and admin forms by hand, and a stray `=` or a `+` from a
/// standard-alphabet encoder should not make a device silently undeliverable.
pub fn decode(s: &str) -> Result<Vec<u8>> {
    let cleaned: String = s
        .trim()
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '=')
        .map(|c| match c {
            '+' => '-',
            '/' => '_',
            other => other,
        })
        .collect();
    URL_SAFE_NO_PAD.decode(cleaned.as_bytes()).context("invalid base64url")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_arbitrary_bytes() {
        let bytes: Vec<u8> = (0u8..=255).collect();
        assert_eq!(decode(&encode(&bytes)).unwrap(), bytes);
    }

    #[test]
    fn encodes_without_padding_and_with_the_url_alphabet() {
        // 0xFB 0xFF would be "+/8=" in the standard alphabet; url-safe unpadded
        // is "-_8". Getting this wrong breaks every VAPID header.
        assert_eq!(encode([0xfb, 0xff]), "-_8");
        assert!(!encode([0u8; 4]).contains('='));
    }

    #[test]
    fn decodes_padded_and_standard_alphabet_input() {
        // A hand-copied key may arrive padded, or from a standard-alphabet tool.
        assert_eq!(decode("-_8").unwrap(), vec![0xfb, 0xff]);
        assert_eq!(decode("+/8=").unwrap(), vec![0xfb, 0xff]);
        assert_eq!(decode(" -_8 \n").unwrap(), vec![0xfb, 0xff]);
    }

    #[test]
    fn rejects_input_that_is_not_base64() {
        assert!(decode("not base64!!").is_err());
    }

    #[test]
    fn decodes_the_rfc_8291_salt_to_sixteen_bytes() {
        // Sanity-check against a real value from the RFC 8291 section 5 vector.
        assert_eq!(decode("DGv6ra1nlYgDCS1FRnbzlw").unwrap().len(), 16);
    }
}
