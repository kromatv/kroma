//! What a tracker's volume factors say about a release.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReleaseFlag {
    Freeleech,
    Halfleech,
    DoubleUpload,
}

/// Reads Torznab's `downloadvolumefactor` and `uploadvolumefactor`: 1 is the
/// ordinary ratio, 0 costs no download, and 2 pays double upload. A factor the
/// tracker did not announce says nothing.
pub fn flags_of(download_factor: Option<f64>, upload_factor: Option<f64>) -> Vec<ReleaseFlag> {
    let mut flags = Vec::new();
    match download_factor {
        Some(factor) if factor <= 0.0 => flags.push(ReleaseFlag::Freeleech),
        Some(factor) if factor < 1.0 => flags.push(ReleaseFlag::Halfleech),
        _ => {}
    }
    if upload_factor.is_some_and(|factor| factor >= 2.0) {
        flags.push(ReleaseFlag::DoubleUpload);
    }
    flags
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_release_that_costs_no_download_is_freeleech() {
        assert_eq!(flags_of(Some(0.0), Some(1.0)), [ReleaseFlag::Freeleech]);
    }

    #[test]
    fn a_release_that_costs_part_of_its_size_is_halfleech() {
        assert_eq!(flags_of(Some(0.5), None), [ReleaseFlag::Halfleech]);
        assert_eq!(flags_of(Some(0.75), None), [ReleaseFlag::Halfleech]);
    }

    #[test]
    fn a_release_that_pays_twice_its_upload_says_so_on_top() {
        assert_eq!(
            flags_of(Some(0.0), Some(2.0)),
            [ReleaseFlag::Freeleech, ReleaseFlag::DoubleUpload]
        );
    }

    #[test]
    fn the_ordinary_ratio_and_a_tracker_that_announced_nothing_carry_no_flag() {
        assert!(flags_of(Some(1.0), Some(1.0)).is_empty());
        assert!(flags_of(None, None).is_empty());
    }
}
