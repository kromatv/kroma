//! The video encoder an operator chose for re-encodes.

use serde_json::json;

use super::{SettingRow, Settings};

/// The setting that names the chosen encoder by its label.
pub const ENCODER_KEY: &str = "hwDevice";

const AUTO: &str = "Auto";
const SOFTWARE: &str = "software";

/// Hands the stored choice to the HLS engine, which uses it from the next
/// session on.
pub fn apply_encoder_choice(settings: &Settings) {
    kroma_media::hls::choose_encoder(&settings.get_str(ENCODER_KEY, AUTO));
}

pub(super) fn row(settings: &Settings, label: String, hint: String) -> SettingRow {
    SettingRow {
        key: ENCODER_KEY.to_owned(),
        label,
        desc: Some(hint),
        kind: "select",
        options: options(&kroma_media::hls::usable_encoders()),
        value: json!(settings.get_str(ENCODER_KEY, AUTO)),
        applied: !kroma_media::hls::encoder_pinned_by_env(),
        configured: None,
    }
}

fn options(usable: &[&str]) -> Vec<String> {
    std::iter::once(AUTO)
        .chain(usable.iter().copied())
        .chain(std::iter::once(SOFTWARE))
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_select_offers_the_probes_choice_then_each_usable_encoder_then_the_cpu() {
        assert_eq!(options(&["qsv", "vaapi"]), ["Auto", "qsv", "vaapi", "software"]);
    }

    #[test]
    fn a_host_with_no_usable_encoder_still_offers_the_probe_and_the_cpu() {
        assert_eq!(options(&[]), ["Auto", "software"]);
    }
}
