use std::fmt;

const MIN_REASONING_TOKENS: u32 = 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Reasoning {
    On,
    Off,
}

impl Reasoning {
    pub(super) fn from_setting(on: bool) -> Self {
        if on {
            Self::On
        } else {
            Self::Off
        }
    }

    pub(super) fn flipped(self) -> Self {
        match self {
            Self::On => Self::Off,
            Self::Off => Self::On,
        }
    }
}

impl fmt::Display for Reasoning {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::On => "on",
            Self::Off => "off",
        })
    }
}

/// One request as KROMA means it, before a provider spells it. `answer_tokens`
/// is the room for the answer alone.
pub(super) struct Ask<'a> {
    pub(super) model: &'a str,
    pub(super) system: &'a str,
    pub(super) answer_tokens: u32,
    pub(super) temperature: f32,
    pub(super) reasoning: Reasoning,
}

impl Ask<'_> {
    /// What a provider that controls reasoning grants it on top of the answer:
    /// as much again, and never under 1024.
    pub(super) fn reasoning_tokens(&self) -> u32 {
        self.answer_tokens.max(MIN_REASONING_TOKENS)
    }

    /// The output budget of a request that may reason: the answer's room and
    /// the reasoning's, so reasoning cannot spend what the answer needs.
    pub(super) fn tokens_with_reasoning(&self) -> u32 {
        self.answer_tokens.saturating_add(self.reasoning_tokens())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ToolChoice {
    Auto,
    None,
}
