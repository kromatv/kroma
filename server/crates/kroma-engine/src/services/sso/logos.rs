//! The logo a sign-in button shows for a provider the server knows by name.

/// The presets an admin can pick, each with its logo. A preset decides the
/// button's mark and nothing about how the provider is spoken to.
const LOGOS: [(&str, &str); 7] = [
    ("keycloak", include_str!("logos/keycloak.svg")),
    ("authentik", include_str!("logos/authentik.svg")),
    ("authelia", include_str!("logos/authelia.svg")),
    ("google", include_str!("logos/google.svg")),
    ("okta", include_str!("logos/okta.svg")),
    ("auth0", include_str!("logos/auth0.svg")),
    ("entra", include_str!("logos/entra.svg")),
];

/// The SVG for `preset`, or `None` for a preset with no logo of its own.
pub fn preset_logo(preset: &str) -> Option<&'static str> {
    LOGOS
        .iter()
        .find(|(name, _)| *name == preset)
        .map(|(_, svg)| *svg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_logo_is_one_svg_that_carries_no_script() {
        for (name, svg) in LOGOS {
            assert!(svg.starts_with("<svg "), "{name}");
            assert!(svg.trim_end().ends_with("</svg>"), "{name}");
            assert!(!svg.contains("<script"), "{name}");
            assert!(!svg.contains("href"), "{name}");
        }
    }

    #[test]
    fn a_preset_without_a_logo_has_none() {
        assert!(preset_logo("keycloak").is_some());
        assert!(preset_logo("pocket-id").is_none());
        assert!(preset_logo("").is_none());
    }
}
