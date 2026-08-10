//! Signing a device in from another device it cannot talk to directly.
//!
//! Both roads end in the same place (the server holds a pending request until a
//! signed-in account approves it, then hands the waiting device an ordinary
//! session) and both are built on the one store in [`grants`]. They differ in
//! how the human points at the device:
//!
//! - [`handoff`] lists the TVs waiting on the caller's own subnet, so pointing
//!   at one is a tap. The road for a phone and a TV on the same network.
//! - [`quickconnect`] shows four digits on the TV for a human to carry. Slower,
//!   but it works from anywhere, so it stays as the fallback.

mod grants;
pub mod handoff;
pub mod quickconnect;
mod throttle;

pub use grants::{Granted, Orphaned, PollState};
pub use handoff::{Handoff, HandoffInner};
pub use quickconnect::{QuickConnect, QuickConnectInner};

/// The session behind an approved poll, for the tests of all three modules.
///
/// Written once because it was written six times, each spelling its own
/// `else { panic!(...) }`: a destructure that can only fail one way does not
/// need six ways of saying so, and a test that reads a poll should read it the
/// same way wherever it lives.
#[cfg(test)]
pub(super) fn approved(state: PollState) -> Option<(String, String, Box<kroma_domain::User>)> {
    match state {
        PollState::Authorized { token, access_token, user } => Some((token, access_token, user)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_poll_that_is_not_authorized_reads_as_no_session() {
        assert!(approved(PollState::Pending).is_none());
        assert!(approved(PollState::Unknown).is_none());
    }
}
