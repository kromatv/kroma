use serde::Serialize;

use super::{DAY, HOUR};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub enum Range {
    #[default]
    #[serde(rename = "live")]
    Live,
    #[serde(rename = "12h")]
    HalfDay,
    #[serde(rename = "24h")]
    Day,
    #[serde(rename = "7d")]
    Week,
    #[serde(rename = "30d")]
    Month,
    #[serde(rename = "90d")]
    Quarter,
    #[serde(rename = "1y")]
    Year,
    #[serde(rename = "all")]
    All,
}

impl Range {
    /// The window a `?range=` value names. Anything else is `Live`, which is
    /// also the default.
    pub fn parse(raw: &str) -> Range {
        match raw {
            "12h" => Range::HalfDay,
            "24h" => Range::Day,
            "7d" => Range::Week,
            "30d" => Range::Month,
            "90d" => Range::Quarter,
            "1y" => Range::Year,
            "all" => Range::All,
            _ => Range::Live,
        }
    }

    pub(super) fn span_secs(self) -> Option<i64> {
        match self {
            Range::Live | Range::All => None,
            Range::HalfDay => Some(12 * HOUR),
            Range::Day => Some(DAY),
            Range::Week => Some(7 * DAY),
            Range::Month => Some(30 * DAY),
            Range::Quarter => Some(90 * DAY),
            Range::Year => Some(365 * DAY),
        }
    }

    pub(super) fn bucket_secs(self) -> Option<i64> {
        match self {
            Range::Live | Range::All => None,
            Range::HalfDay => Some(5 * 60),
            Range::Day => Some(10 * 60),
            Range::Week => Some(HOUR),
            Range::Month => Some(4 * HOUR),
            Range::Quarter => Some(12 * HOUR),
            Range::Year => Some(DAY),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unnamed_window_reads_as_live() {
        assert_eq!(Range::parse(""), Range::Live);
        assert_eq!(Range::parse("6h"), Range::Live);
        assert_eq!(Range::parse("7D"), Range::Live);
        assert_eq!(Range::parse(&"9".repeat(4096)), Range::Live);
    }

    #[test]
    fn every_word_the_control_offers_names_its_own_window() {
        let named = ["12h", "24h", "7d", "30d", "90d", "1y"];

        let ranges: Vec<Range> = named.iter().map(|r| Range::parse(r)).collect();

        assert_eq!(
            ranges,
            [
                Range::HalfDay,
                Range::Day,
                Range::Week,
                Range::Month,
                Range::Quarter,
                Range::Year
            ]
        );
        assert_eq!(Range::parse("all"), Range::All);
    }

    #[test]
    fn a_named_window_divides_into_between_a_hundred_and_four_hundred_points() {
        for range in [
            Range::HalfDay,
            Range::Day,
            Range::Week,
            Range::Month,
            Range::Quarter,
            Range::Year,
        ] {
            let span = range.span_secs().unwrap();
            let bucket = range.bucket_secs().unwrap();

            assert_eq!(span % bucket, 0, "{range:?}");
            assert!((100..=400).contains(&(span / bucket)), "{range:?}");
        }
    }

    #[test]
    fn the_two_open_ended_windows_name_neither_a_span_nor_a_bucket() {
        for range in [Range::Live, Range::All] {
            assert_eq!(range.span_secs(), None);
            assert_eq!(range.bucket_secs(), None);
        }
    }

    #[test]
    fn a_range_goes_on_the_wire_as_the_word_the_control_shows() {
        let json = serde_json::to_string(&[Range::Live, Range::Week, Range::All]).unwrap();

        assert_eq!(json, r#"["live","7d","all"]"#);
    }
}
