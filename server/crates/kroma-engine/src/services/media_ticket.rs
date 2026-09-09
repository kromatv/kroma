//! The credential a media byte request carries in its URL, for the players that
//! cannot send a header: a `<video>` element, hls.js, AVPlay, mpv.
//!
//! A ticket names the device it was minted for and expires on its own. It is not
//! a bearer: it proves which signed-in device asked, and the library grant is
//! still read from the database on every request, so narrowing a grant takes
//! effect at once.

use serde_json::json;

use crate::db::Pool;

use super::settings::Settings;

/// Long enough to outlast a feature film answered from one `<video src>`, short
/// enough that a URL copied out of a log or a browser history stops working the
/// same day.
pub const TTL_SECS: i64 = 12 * 3600;

const KEY_SETTING: &str = "mediaTicketKey";
const SIG_HEX_LEN: usize = 32;

/// The per-install signing key, minted on first use and persisted with the
/// settings. Never served: it is stored through [`Settings::set_internal`], so no
/// admin response and no settings patch can read or write it.
pub fn signing_key(settings: &Settings, pool: &Pool) -> String {
    let existing = settings.get_str(KEY_SETTING, "");
    if !existing.trim().is_empty() {
        return existing;
    }
    let key = super::auth::random_token();
    settings.set_internal(pool, KEY_SETTING, json!(key.clone()));
    key
}

/// A ticket for the device behind `access_token`, valid for [`TTL_SECS`]. Handed
/// out beside every session token, so a client holds one the moment it holds a
/// session.
pub fn for_access_token(key: &str, access_token: &str) -> String {
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    mint(key, &kroma_primitives::short_hash(access_token), now)
}

/// A ticket for `device_id` (the non-secret `short_hash` of a device's access
/// token) valid for [`TTL_SECS`] from `now`.
pub fn mint(key: &str, device_id: &str, now: i64) -> String {
    let expires_at = now + TTL_SECS;
    let claim = format!("{device_id}.{expires_at}");
    let signature = sign(key, &claim);
    format!("{claim}.{signature}")
}

/// The device a live, correctly signed `ticket` was minted for, or `None` for one
/// that is malformed, forged or past its expiry.
pub fn device_of(key: &str, ticket: &str, now: i64) -> Option<String> {
    let (claim, signature) = ticket.rsplit_once('.')?;
    let (device_id, expires_at) = claim.split_once('.')?;
    if device_id.is_empty() || !device_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    if !equal_in_constant_time(signature, &sign(key, claim)) {
        return None;
    }
    if expires_at.parse::<i64>().ok()? <= now {
        return None;
    }
    Some(device_id.to_string())
}

fn sign(key: &str, claim: &str) -> String {
    let mac = super::auth::hmac_sha256(key.as_bytes(), claim.as_bytes());
    hex::encode(mac)[..SIG_HEX_LEN].to_string()
}

// A signature compared byte by byte leaks how much of a forgery was right, which
// is enough to recover the rest one request at a time.
fn equal_in_constant_time(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes()
        .zip(b.bytes())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "0123456789abcdef0123456789abcdef";
    const DEVICE: &str = "a1b2c3d4e5f60718";
    const NOW: i64 = 1_700_000_000;

    #[test]
    fn a_freshly_minted_ticket_names_the_device_it_was_minted_for() {
        let ticket = mint(KEY, DEVICE, NOW);

        assert_eq!(device_of(KEY, &ticket, NOW).as_deref(), Some(DEVICE));
    }

    #[test]
    fn a_ticket_for_an_access_token_names_the_device_that_token_is() {
        let ticket = for_access_token(KEY, "an-access-token");
        let now = time::OffsetDateTime::now_utc().unix_timestamp();

        assert_eq!(
            device_of(KEY, &ticket, now).as_deref(),
            Some(kroma_primitives::short_hash("an-access-token").as_str())
        );
    }

    #[test]
    fn a_ticket_outlives_a_feature_film_and_not_the_day() {
        let ticket = mint(KEY, DEVICE, NOW);

        assert!(device_of(KEY, &ticket, NOW + 3 * 3600).is_some());
        assert!(device_of(KEY, &ticket, NOW + TTL_SECS - 1).is_some());
        assert!(device_of(KEY, &ticket, NOW + TTL_SECS).is_none());
    }

    #[test]
    fn a_ticket_signed_by_another_install_is_refused() {
        let ticket = mint("a-different-key", DEVICE, NOW);

        assert!(device_of(KEY, &ticket, NOW).is_none());
    }

    #[test]
    fn neither_half_of_a_ticket_can_be_edited_without_breaking_it() {
        let ticket = mint(KEY, DEVICE, NOW);
        let (claim, signature) = ticket.rsplit_once('.').expect("a signed ticket");
        let (_device, expires_at) = claim.split_once('.').expect("a device and an expiry");

        let other_device = format!("ffffffffffffffff.{expires_at}.{signature}");
        let later = format!("{DEVICE}.{}.{signature}", NOW + 10 * TTL_SECS);

        assert!(device_of(KEY, &other_device, NOW).is_none());
        assert!(device_of(KEY, &later, NOW).is_none());
    }

    #[test]
    fn nothing_shaped_unlike_a_ticket_resolves_to_a_device() {
        for malformed in [
            "",
            ".",
            "..",
            "no-dots",
            &format!(
                "{DEVICE}.notanumber.{}",
                sign(KEY, &format!("{DEVICE}.notanumber"))
            ),
            &format!("nothex.{NOW}.{}", sign(KEY, &format!("nothex.{NOW}"))),
            &format!(".{NOW}.{}", sign(KEY, &format!(".{NOW}"))),
        ] {
            assert!(
                device_of(KEY, malformed, NOW).is_none(),
                "{malformed:?} should not resolve"
            );
        }
    }

    #[test]
    fn a_signature_of_the_wrong_length_is_refused_before_it_is_compared() {
        let ticket = mint(KEY, DEVICE, NOW);
        let truncated = &ticket[..ticket.len() - 1];

        assert!(device_of(KEY, truncated, NOW).is_none());
        assert!(!equal_in_constant_time("abc", "ab"));
        assert!(equal_in_constant_time("abc", "abc"));
    }
}
