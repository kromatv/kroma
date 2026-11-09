//! How a bearer is kept at rest: its SHA-256, never the bearer itself, so a copy
//! of the database signs nobody in. The device id the apps see is the first 16
//! characters of the same hash, which is what `short_hash` of the bearer gave.

pub(crate) fn stored(token: &str) -> String {
    kroma_primitives::sha256_hex(token)
}

pub(crate) fn device_id(stored: &str) -> String {
    stored.get(..16).unwrap_or(stored).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_device_id_is_the_short_hash_of_its_bearer() {
        let bearer = "an-access-token";

        let id = device_id(&stored(bearer));

        assert_eq!(id, kroma_primitives::short_hash(bearer));
    }

    #[test]
    fn the_stored_form_is_not_the_bearer() {
        let bearer = "an-access-token";

        let kept = stored(bearer);

        assert_ne!(kept, bearer);
        assert_eq!(kept.len(), 64);
    }
}
