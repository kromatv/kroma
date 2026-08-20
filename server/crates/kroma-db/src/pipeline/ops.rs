//! Ledger write / lifecycle operations. Every write is batched into a single
//! IMMEDIATE transaction: it takes the write lock at BEGIN, so `busy_timeout`
//! serializes concurrent stage drains, where a deferred transaction cannot
//! upgrade mid-flight and fails `SQLITE_BUSY` instead of waiting. Timestamps
//! are epoch milliseconds.

mod drain;
mod reconcile;

#[cfg(test)]
mod test_support;

pub use drain::*;
pub use reconcile::*;

/// How many times a failed task is auto-retried across drains before it sticks
/// as `failed` and waits for a manual retry.
pub const MAX_ATTEMPTS: i64 = 3;

const RETRY_BASE_MS: i64 = 5 * 60 * 1000;

/// Quadratic backoff between auto-retries: attempt 1 -> 5 min, attempt 2 ->
/// 20 min. Keeps a manually re-kicked stage from hammering a flaky dependency
/// with back-to-back retries.
pub fn retry_backoff_ms(attempts: i64) -> i64 {
    RETRY_BASE_MS * attempts * attempts
}

/// Sentinel signature meaning the subject's inputs were unreadable at enumerate
/// time; `reconcile` leaves such a task exactly as it is, so a flapping mount
/// cannot re-queue the whole library. Cannot collide with a real signature.
pub const UNREADABLE_SIG: &str = "\u{0}unreadable";

/// A unit of work: the subject's id + a signature of its current inputs. A task
/// is skipped while `status='done'` and its stored signature still matches, and
/// re-queued the moment the signature changes.
pub type Subject = (String, String);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_grows_quadratically() {
        assert_eq!(retry_backoff_ms(1), 5 * 60 * 1000);
        assert_eq!(retry_backoff_ms(2), 20 * 60 * 1000);
        assert!(retry_backoff_ms(2) > retry_backoff_ms(1));
    }
}
