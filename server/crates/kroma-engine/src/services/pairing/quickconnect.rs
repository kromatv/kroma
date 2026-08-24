//! Quick Connect (Plex/Jellyfin-style): a device shows a short code, a signed-in
//! user approves it, and the device polls with its private secret until it gets a
//! session token.
//!
//! The fallback path. It asks a human to carry four digits between two screens,
//! which is what makes it work anywhere (across subnets, over a tunnel, from a
//! phone on cellular) and what makes [`super::handoff`] the nicer road when both
//! devices sit on the same network.

use std::sync::Arc;

use super::grants::{Filed, Granted, Grants, Orphaned, PollState};
use crate::model::User;
use crate::services::auth::random_u32;

pub const CODE_TTL_SECS: i64 = 300;
const CODE_DIGITS: u32 = 4;
// `initiate` is unauthenticated by design, so this bounds the store against a
// flood. It also keeps it sparse against the 10^CODE_DIGITS keyspace, so the
// code-minting loop stays collision-free.
const MAX_PENDING: usize = 256;

pub struct QuickConnectInner {
    grants: Grants<()>,
}

pub type QuickConnect = Arc<QuickConnectInner>;

pub struct Initiated {
    pub code: String,
    pub secret: String,
    pub expires_in: i64,
}

pub fn new() -> QuickConnect {
    Arc::new(QuickConnectInner {
        grants: Grants::new(CODE_TTL_SECS, MAX_PENDING),
    })
}

impl QuickConnectInner {
    /// Create a pending request → a free code + a private secret, or None while
    /// the store is full.
    ///
    /// Refusing beats evicting on an endpoint nobody has to authenticate to:
    /// evicting would let whoever asks most often decide whose code survives.
    /// A device that is refused shows its error and the human tries again,
    /// which is a far better failure than a code that silently stops working.
    pub fn initiate(&self) -> Option<Initiated> {
        let modulo = 10u32.pow(CODE_DIGITS);
        let Filed {
            handle: code,
            secret,
        } = self.grants.insert((), || {
            format!(
                "{:0>width$}",
                random_u32() % modulo,
                width = CODE_DIGITS as usize
            )
        })?;
        Some(Initiated {
            code,
            secret,
            expires_in: CODE_TTL_SECS,
        })
    }

    /// Tokens of codes that lapsed, for the caller to delete.
    pub fn take_orphans(&self) -> Vec<Orphaned> {
        self.grants.take_orphans()
    }

    /// Approve a code for `user`, attaching a freshly-minted session `token` and
    /// the device's long-lived `access_token`. False if unknown/expired.
    pub fn authorize(&self, code: &str, user: User, token: String, access_token: String) -> bool {
        self.grants.authorize(
            code,
            |()| true,
            Granted {
                token,
                access_token,
                user,
            },
        )
    }

    /// Forget the pending entry whose secret matches, surrendering any tokens it
    /// had already accrued (approved in the gap before the device rotated its
    /// code, so nobody will ever collect them) for the caller to delete.
    pub fn revoke(&self, secret: &str) -> Option<Orphaned> {
        self.grants.forget(secret)
    }

    /// Poll by secret. Once approved, the entry is consumed and its tokens +
    /// user returned.
    pub fn poll(&self, secret: &str) -> PollState {
        self.grants.poll(secret)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::pairing::approved;

    fn user() -> User {
        crate::test_support::test_user("u1", vec![])
    }

    #[test]
    fn a_code_is_four_digits_and_its_secret_is_not() {
        let qc = new();
        let init = qc.initiate().expect("room in the store");
        assert_eq!(init.code.len(), CODE_DIGITS as usize);
        assert!(init.code.chars().all(|c| c.is_ascii_digit()));
        assert_ne!(init.code, init.secret);
        assert_eq!(init.expires_in, CODE_TTL_SECS);
    }

    #[test]
    fn approving_a_code_hands_the_device_its_session() {
        let qc = new();
        let init = qc.initiate().expect("room in the store");
        assert!(matches!(qc.poll(&init.secret), PollState::Pending));
        assert!(qc.authorize(&init.code, user(), "tok".into(), "acc".into()));

        let (token, access_token, user) =
            approved(qc.poll(&init.secret)).expect("the approved session");
        assert_eq!((token.as_str(), access_token.as_str()), ("tok", "acc"));
        assert_eq!(user.id, "u1");
    }

    #[test]
    fn an_unknown_code_is_refused() {
        let qc = new();
        assert!(!qc.authorize("0000", user(), "tok".into(), "acc".into()));
    }

    #[test]
    fn revoke_forgets_a_pending_code() {
        let qc = new();
        let init = qc.initiate().expect("room in the store");
        assert!(qc.revoke(&init.secret).is_none());
        assert!(matches!(qc.poll(&init.secret), PollState::Unknown));
        assert!(qc.revoke("nope").is_none());
    }

    #[test]
    fn revoke_surrenders_the_tokens_of_a_code_approved_too_late() {
        let qc = new();
        let init = qc.initiate().expect("room in the store");
        assert!(qc.authorize(&init.code, user(), "tok".into(), "acc".into()));
        let orphan = qc
            .revoke(&init.secret)
            .expect("approved but never polled for");
        assert_eq!(
            (orphan.token.as_str(), orphan.access_token.as_str()),
            ("tok", "acc")
        );
    }

    #[test]
    fn a_flood_is_refused_rather_than_allowed_to_evict() {
        // Evicting would let whoever asks most often decide whose code stops
        // working, on an endpoint nobody has to authenticate to.
        let qc = new();
        let first = qc.initiate().expect("the first always fits");
        for _ in 0..MAX_PENDING {
            qc.initiate();
        }
        assert_eq!(qc.grants.len(), MAX_PENDING);
        assert!(qc.initiate().is_none(), "full refuses");
        // And the code that was already there still works.
        assert!(matches!(qc.poll(&first.secret), PollState::Pending));
    }
}
