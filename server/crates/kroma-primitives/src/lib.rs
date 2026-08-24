//! Low-level, dependency-light primitives shared across the server's layers:
//! monotonic-ish wall-clock timestamps, stable short hashes, and random tokens.
//! `services::{jobs::now_ms, scan::{now_iso8601, short_hash}, auth::random_*}`
//! re-export these for backwards compatibility.

use sha2::{Digest, Sha256};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

/// Current time as epoch milliseconds (UTC instant).
pub fn now_ms() -> i64 {
    (OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000) as i64
}

/// Current time as an RFC3339 / ISO8601 string (UTC).
pub fn now_iso8601() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

/// `hex(sha256(input))[..16]` stable, short, collision-resistant enough.
pub fn short_hash(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())[..16].to_string()
}

/// `n` cryptographically-secure random bytes, read from the OS CSPRNG
/// (`/dev/urandom`, falling back to `/dev/random`).
///
/// No algorithmic fallback: every session token and password salt derives
/// from this, so a clock-seeded stand-in would let an attacker who can
/// estimate the generation time brute-force the seed. We panic instead of
/// minting predictable secrets.
pub fn random_bytes(n: usize) -> Vec<u8> {
    use std::io::Read;
    let mut buf = vec![0u8; n];
    for path in ["/dev/urandom", "/dev/random"] {
        if let Ok(mut f) = std::fs::File::open(path) {
            if f.read_exact(&mut buf).is_ok() {
                return buf;
            }
        }
    }
    panic!("kroma-primitives: OS CSPRNG unavailable; refusing to generate insecure randomness");
}

/// A fresh opaque session token: 32 random bytes, hex-encoded (64 chars).
pub fn random_token() -> String {
    hex::encode(random_bytes(32))
}

/// A random `u32` (used to pick Quick Connect numeric codes).
pub fn random_u32() -> u32 {
    let b = random_bytes(4);
    u32::from_le_bytes([b[0], b[1], b[2], b[3]])
}

/// The shape every self-declared device id must have: 8-64 of
/// `[A-Za-z0-9._-]`. Long enough to be unique per device, narrow enough that a
/// caller cannot smuggle a path segment or a control character through one.
pub fn valid_device_id(id: &str) -> bool {
    (8..=64).contains(&id.len())
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// A device-supplied label, trimmed to `max` characters with control characters
/// stripped: these are rendered in other people's device pickers, where a raw
/// newline could otherwise forge a line.
pub fn clean_label(s: &str, max: usize) -> String {
    let out: String = s.chars().filter(|c| !c.is_control()).take(max).collect();
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_device_id_must_be_long_enough_and_plain_enough() {
        assert!(valid_device_id("tv-abcdef"));
        assert!(valid_device_id(&"y".repeat(64)));
        assert!(!valid_device_id("short"));
        assert!(!valid_device_id(&"y".repeat(65)));
        assert!(!valid_device_id("has spaces"));
        assert!(!valid_device_id("../escape"));
        assert!(!valid_device_id(""));
    }

    #[test]
    fn a_label_loses_its_control_characters_and_its_overflow() {
        assert_eq!(clean_label("  Salon  ", 48), "Salon");
        assert_eq!(clean_label("Salon\nAdmin", 48), "SalonAdmin");
        assert_eq!(clean_label(&"a".repeat(80), 10), "a".repeat(10));
        // Truncation counts characters, not bytes: a multi-byte label survives.
        assert_eq!(clean_label("téléviseur", 4), "télé");
    }
}
