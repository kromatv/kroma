/// The coarse band a user count falls in. Never the count itself: an exact
/// number is a fingerprint, a band is a statistic.
pub fn users(n: i64) -> &'static str {
    match n {
        ..=1 => "1",
        2..=5 => "2-5",
        6..=20 => "6-20",
        _ => "21+",
    }
}

/// The coarse band a library's title count falls in.
pub fn titles(n: i64) -> &'static str {
    match n {
        ..=99 => "0-99",
        100..=999 => "100-999",
        1000..=4999 => "1k-4999",
        _ => "5k+",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_lone_operator_and_an_empty_server_land_in_the_first_band() {
        assert_eq!(users(0), "1");
        assert_eq!(users(1), "1");
        assert_eq!(titles(0), "0-99");
    }

    #[test]
    fn every_user_band_is_reported_at_its_own_edges() {
        assert_eq!(users(2), "2-5");
        assert_eq!(users(5), "2-5");
        assert_eq!(users(6), "6-20");
        assert_eq!(users(20), "6-20");
        assert_eq!(users(21), "21+");
        assert_eq!(users(9_000), "21+");
    }

    #[test]
    fn every_title_band_is_reported_at_its_own_edges() {
        assert_eq!(titles(99), "0-99");
        assert_eq!(titles(100), "100-999");
        assert_eq!(titles(999), "100-999");
        assert_eq!(titles(1_000), "1k-4999");
        assert_eq!(titles(4_999), "1k-4999");
        assert_eq!(titles(5_000), "5k+");
    }
}
