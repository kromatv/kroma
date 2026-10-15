use std::num::NonZeroU32;

use librqbit::limits::Limits;

use super::RqbitEngine;

impl RqbitEngine {
    /// A torrent already in flight picks the new ceiling up on its next block,
    /// and `None` is unlimited. Safe to call on a timer, because a ceiling that
    /// has not moved is left alone rather than pushed again onto a fresh token
    /// bucket.
    pub fn set_rate_limits(&self, download_bps: Option<u32>, upload_bps: Option<u32>) {
        set_if_moved(&self.session().ratelimits, download_bps, upload_bps);
    }
}

fn set_if_moved(limits: &Limits, download_bps: Option<u32>, upload_bps: Option<u32>) {
    let down = download_bps.and_then(NonZeroU32::new);
    let up = upload_bps.and_then(NonZeroU32::new);
    if limits.get_download_bps() != down {
        limits.set_download_bps(down);
    }
    if limits.get_upload_bps() != up {
        limits.set_upload_bps(up);
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use librqbit::limits::LimitsConfig;

    use super::*;

    const CEILING_BPS: u32 = 64;

    fn ceiling() -> NonZeroU32 {
        NonZeroU32::new(CEILING_BPS).unwrap()
    }

    async fn drained() -> Limits {
        let limits = Limits::new(LimitsConfig {
            download_bps: Some(ceiling()),
            upload_bps: None,
        });
        limits.prepare_for_download(ceiling()).await.unwrap();
        limits
    }

    async fn makes_the_next_block_wait(limits: &Limits) -> bool {
        tokio::time::timeout(
            Duration::from_millis(100),
            limits.prepare_for_download(ceiling()),
        )
        .await
        .is_err()
    }

    #[tokio::test]
    async fn librqbit_hands_out_a_whole_second_of_burst_on_every_set() {
        let limits = drained().await;

        limits.set_download_bps(Some(ceiling()));

        assert!(!makes_the_next_block_wait(&limits).await);
    }

    #[tokio::test]
    async fn a_ceiling_re_asserted_unchanged_leaves_the_bucket_where_it_was() {
        let limits = drained().await;

        set_if_moved(&limits, Some(CEILING_BPS), None);

        assert!(makes_the_next_block_wait(&limits).await);
    }

    #[tokio::test]
    async fn a_ceiling_that_moved_is_pushed_through() {
        let limits = drained().await;

        set_if_moved(&limits, None, Some(CEILING_BPS));

        assert_eq!(limits.get_download_bps(), None);
        assert_eq!(limits.get_upload_bps(), Some(ceiling()));
    }
}
