//! How far one settings key reaches out of the core.

/// What the module host callback may do with a settings key. The core declares
/// it beside the key's default; the supervisor carries the answer and never
/// decides it.
///
/// [`Self::Declared`] is the only one a module reaches: the key goes to a module
/// that names it in its manifest's `settings.read` to read it, or `settings.write`
/// to write it, and to no other. A caller the callback cannot name holds no
/// declaration, so it reaches none.
///
/// [`Self::Unknown`] is refused like [`Self::CoreOnly`] and separate from it only
/// so the refusal can say what it is: a module asking for the mail password is
/// refused because the key is the core's, one asking for a key the core has never
/// heard of is a typo or a feature that left.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettingReach {
    Unknown,
    CoreOnly,
    Declared,
}

/// Asks the core how far a settings key reaches. The supervisor holds this and
/// nothing else about what any key means.
#[derive(Clone, Copy)]
pub struct SettingReachOf(pub fn(&str) -> SettingReach);
