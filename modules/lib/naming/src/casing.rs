//! The case a rendered name is emitted in, as the admin setting spells it.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Casing {
    #[default]
    Default,
    Upper,
    Lower,
}

impl Casing {
    pub fn from_key(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "upper" | "uppercase" => Self::Upper,
            "lower" | "lowercase" => Self::Lower,
            _ => Self::Default,
        }
    }

    pub fn as_key(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Upper => "upper",
            Self::Lower => "lower",
        }
    }

    pub(super) fn apply(self, s: &str) -> String {
        match self {
            Self::Default => s.to_string(),
            Self::Upper => s.to_uppercase(),
            Self::Lower => s.to_lowercase(),
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn casing_from_and_as_key_round_trip() {
        assert_eq!(Casing::from_key("upper"), Casing::Upper);
        assert_eq!(Casing::from_key("UPPERCASE"), Casing::Upper);
        assert_eq!(Casing::from_key("  Lower  "), Casing::Lower);
        assert_eq!(Casing::from_key("lowercase"), Casing::Lower);
        assert_eq!(Casing::from_key("default"), Casing::Default);
        assert_eq!(Casing::from_key("nonsense"), Casing::Default);
        assert_eq!(Casing::from_key(""), Casing::Default);

        for c in [Casing::Upper, Casing::Lower, Casing::Default] {
            assert_eq!(Casing::from_key(c.as_key()), c);
        }
        assert_eq!(Casing::default(), Casing::Default);
    }
}
