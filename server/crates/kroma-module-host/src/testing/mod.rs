//! Shared [`HostCtx`] test doubles, in two shapes:
//!
//! * [`StubHost`] a host that is not backed by an app at all. Its answers are
//!   the neutral ones (settings return the caller's default, gates allow, the
//!   bus records rather than delivers) and each is overridable.
//! * [`Recording`] a decorator over a REAL host, forwarding everything but
//!   capturing the bus traffic. For tests that need the app's true behaviour and
//!   only want to see what it published.
//!
//! Gated on the `testing` feature so it never reaches a release build; the
//! crates that use it enable it as a dev-dependency.

mod log;
mod recording;
mod stub;

pub use log::Published;
pub use recording::Recording;
pub use stub::StubHost;

#[cfg(test)]
mod fixtures {
    use kroma_domain::{NotificationEvent, NotificationSpec, User};

    pub fn spec() -> NotificationSpec {
        NotificationSpec::new(
            NotificationEvent::RequestApproved,
            "notifications.request.approved.title",
            "notifications.request.approved.body",
        )
    }

    pub fn user() -> User {
        User {
            id: "u1".into(),
            email: "a@b.c".into(),
            username: "ana".into(),
            avatar_url: None,
            language: None,
            audio_language: None,
            subtitle_language: None,
            permissions: Vec::new(),
            created_at: "2024-01-01T00:00:00Z".into(),
            has_pin: false,
        }
    }
}
