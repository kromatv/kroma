use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

const LIFETIME_MS: i64 = 60_000;

// A signed-in caller can ask for as many as it likes, and a forgotten challenge
// must not hold memory past its minute.
const MAX_OPEN: usize = 4096;

/// What a signed-in client is handed to test a route: the `nonce` it sends down
/// the route, and the `answer` only this server will send back for it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Challenge {
    pub nonce: String,
    pub answer: String,
}

struct Open {
    answer: String,
    expires_at_ms: i64,
}

/// The challenges handed out in the last minute, each redeemable once.
#[derive(Default)]
pub struct Challenges {
    open: Mutex<HashMap<String, Open>>,
}

impl Challenges {
    pub fn issue(&self, now_ms: i64) -> Challenge {
        let challenge = Challenge {
            nonce: kroma_primitives::random_token(),
            answer: kroma_primitives::random_token(),
        };
        let mut open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        open.retain(|_, entry| entry.expires_at_ms > now_ms);
        if open.len() >= MAX_OPEN {
            open.clear();
        }
        open.insert(
            challenge.nonce.clone(),
            Open {
                answer: challenge.answer.clone(),
                expires_at_ms: now_ms + LIFETIME_MS,
            },
        );
        challenge
    }

    /// The answer to `nonce`, once: a second redemption, or one after the
    /// minute, finds nothing.
    pub fn redeem(&self, nonce: &str, now_ms: i64) -> Option<String> {
        let mut open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        let entry = open.remove(nonce)?;
        (entry.expires_at_ms > now_ms).then_some(entry.answer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_000_000;

    #[test]
    fn a_challenge_is_answered_once() {
        let challenges = Challenges::default();
        let issued = challenges.issue(NOW);

        let first = challenges.redeem(&issued.nonce, NOW + 1);
        let second = challenges.redeem(&issued.nonce, NOW + 2);

        assert_eq!(first, Some(issued.answer));
        assert_eq!(second, None);
    }

    #[test]
    fn a_challenge_lapses_after_a_minute() {
        let challenges = Challenges::default();
        let issued = challenges.issue(NOW);

        assert_eq!(challenges.redeem(&issued.nonce, NOW + LIFETIME_MS), None);
    }

    #[test]
    fn a_nonce_nobody_issued_has_no_answer() {
        let challenges = Challenges::default();
        challenges.issue(NOW);

        assert_eq!(challenges.redeem("made-up", NOW), None);
    }

    #[test]
    fn the_nonce_and_the_answer_are_separate_secrets() {
        let issued = Challenges::default().issue(NOW);

        assert_ne!(issued.nonce, issued.answer);
        assert_eq!(issued.nonce.len(), 64);
    }

    #[test]
    fn lapsed_challenges_are_dropped_when_the_next_one_is_issued() {
        let challenges = Challenges::default();
        challenges.issue(NOW);

        challenges.issue(NOW + LIFETIME_MS + 1);

        assert_eq!(challenges.open.lock().unwrap().len(), 1);
    }
}
