//! How far one settings key reaches out of the core.

/// What the module host callback may do with a settings key. The core declares
/// it beside the key's default; the supervisor carries the answer and never
/// decides it.
///
/// [`Self::Declared`] is the narrow one: the key is handed to a module because a
/// module is what consumes it, and to no module that did not say in its manifest
/// that it reads or writes it. A caller the callback cannot name holds no
/// declaration, so it reaches none of these.
///
/// [`Self::Unknown`] is withheld like [`Self::CoreOnly`] and separate from it only
/// so the refusal can be logged for what it is: a module asking for the mail
/// password is worth an operator's attention, one asking for a key the core has
/// never heard of is a typo or a feature that left.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettingReach {
    Unknown,
    CoreOnly,
    Declared,
    Any,
}

/// Asks the core how far a settings key reaches. The supervisor holds this and
/// nothing else about what any key means.
#[derive(Clone, Copy)]
pub struct SettingReachOf(pub fn(&str) -> SettingReach);
