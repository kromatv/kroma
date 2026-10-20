use std::time::Duration;

use anyhow::Result;

pub(super) const BUSY_BACKOFF: [Duration; 7] = [
    Duration::from_millis(250),
    Duration::from_millis(500),
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(4),
    Duration::from_secs(8),
    Duration::from_secs(16),
];

pub(super) fn until_it_lands<T>(
    backoff: &[Duration],
    what: &str,
    mut write: impl FnMut() -> Result<T>,
) -> Result<T> {
    let mut waits = backoff.iter();
    loop {
        match write() {
            Ok(done) => return Ok(done),
            Err(e) => match waits.next() {
                Some(wait) => {
                    tracing::debug!(error = %format!("{e:#}"), retry_in = ?wait, "{what} failed, retrying");
                    std::thread::sleep(*wait);
                }
                None => return Err(e),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_write_that_fails_a_few_times_lands_on_a_later_attempt() {
        let mut attempts = 0;

        let landed = until_it_lands(&[Duration::ZERO; 3], "write", || {
            attempts += 1;
            if attempts < 3 {
                anyhow::bail!("database is locked");
            }
            Ok(attempts)
        });

        assert_eq!(landed.unwrap(), 3);
    }

    #[test]
    fn a_write_that_never_lands_gives_up_after_the_last_wait() {
        let mut attempts = 0;

        let landed: Result<()> = until_it_lands(&[Duration::ZERO; 2], "write", || {
            attempts += 1;
            anyhow::bail!("database is locked")
        });

        assert!(landed.is_err());
        assert_eq!(attempts, 3);
    }
}
