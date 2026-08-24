//! Request lifecycle: create, approve, deny, and the availability matcher.
//! Synchronous and does network/DB work: call it from a blocking context, never
//! inline in an async handler.

mod availability;
mod coverage;
mod create;
mod imported;
mod notify;
mod refresh;
mod review;
mod wanted;

#[cfg(test)]
mod test_fixtures;
#[cfg(test)]
mod test_support;

pub use availability::{availability_pass, match_one, MatchSummary};
pub use coverage::set_coverage;
pub use create::create_request;
pub use imported::on_download_imported;
pub use refresh::refresh_pass;
pub use review::{approve_request, deny_request};
pub use wanted::preview_wanted;

use anyhow::{anyhow, Result};

use kroma_module_host::HostStorage;

fn tmdb_key<S: HostStorage>(state: &S) -> Result<String> {
    state
        .secret("tmdb")
        .ok_or_else(|| anyhow!("TMDB is not configured"))
}

fn language<S: HostStorage>(state: &S) -> String {
    state.metadata_language()
}

/// Today as `YYYY-MM-DD` in UTC, the wanted ledger's air-date vocabulary.
pub fn today_ymd() -> String {
    let now = time::OffsetDateTime::now_utc();
    format!(
        "{:04}-{:02}-{:02}",
        now.year(),
        u8::from(now.month()),
        now.day()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn today_ymd_is_well_formed() {
        let today = today_ymd();
        assert_eq!(today.len(), 10);
        let bytes = today.as_bytes();
        assert_eq!(bytes[4], b'-');
        assert_eq!(bytes[7], b'-');
        let parts: Vec<&str> = today.split('-').collect();
        assert_eq!(parts.len(), 3);
        let (y, m, d): (i32, u8, u8) = (
            parts[0].parse().unwrap(),
            parts[1].parse().unwrap(),
            parts[2].parse().unwrap(),
        );
        assert!(y >= 2020);
        assert!((1..=12).contains(&m));
        assert!((1..=31).contains(&d));
    }
}
