use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use x25519_dalek::{PublicKey, StaticSecret};

/// A fresh WireGuard key pair from the host's random source, base64 the way
/// WireGuard writes keys: `(private, public)`.
pub(crate) fn keypair() -> (String, String) {
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&kroma_module_sdk::primitives::random_bytes(32));
    let secret = StaticSecret::from(bytes);
    let public = PublicKey::from(&secret);
    (
        STANDARD.encode(secret.to_bytes()),
        STANDARD.encode(public.as_bytes()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn public_of(private: &str) -> Option<String> {
        let bytes: [u8; 32] = STANDARD.decode(private.trim()).ok()?.try_into().ok()?;
        Some(STANDARD.encode(PublicKey::from(&StaticSecret::from(bytes)).as_bytes()))
    }

    fn hex(text: &str) -> Vec<u8> {
        (0..text.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn the_public_half_matches_the_rfc_7748_vector() {
        let private = STANDARD.encode(hex(
            "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a",
        ));

        let public = public_of(&private).unwrap();

        assert_eq!(
            STANDARD.decode(public).unwrap(),
            hex("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a")
        );
    }

    #[test]
    fn a_fresh_pair_belongs_together_and_never_repeats() {
        let (private, public) = keypair();
        let (other, _) = keypair();

        assert_eq!(public_of(&private).as_deref(), Some(public.as_str()));
        assert_ne!(private, other);
    }

    #[test]
    fn text_that_is_not_a_key_has_no_public_half() {
        assert_eq!(public_of("not a key"), None);
        assert_eq!(public_of(&STANDARD.encode([1u8; 16])), None);
    }
}
