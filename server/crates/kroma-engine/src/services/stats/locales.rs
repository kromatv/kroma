use kroma_db::DeviceHints;

/// Which languages the devices on this server ask for, as a set and never as
/// counts: the sum of per-language counts would give away the user total that
/// the bucket exists to keep coarse.
///
/// The tag is what the device asked for, not what KROMA answered with, so a
/// reader running the French UI on a German phone shows up as German. That is
/// the whole reason to collect it.
// The collector refuses a longer list, and a server whose devices speak more
// languages than this is not the one the field exists to find.
const MAX_TAGS: usize = 32;

pub fn spoken(devices: &[DeviceHints]) -> Vec<String> {
    let mut tags: Vec<String> = devices
        .iter()
        .filter_map(|d| d.language.as_deref())
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(str::to_ascii_lowercase)
        .collect();
    tags.sort();
    tags.dedup();
    tags.truncate(MAX_TAGS);
    tags
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asking(language: Option<&str>) -> DeviceHints {
        DeviceHints {
            user_agent: None,
            language: language.map(str::to_string),
        }
    }

    #[test]
    fn a_language_is_named_once_however_many_devices_ask_for_it() {
        let devices = [
            asking(Some("fr-ch")),
            asking(Some("fr-ch")),
            asking(Some("de")),
        ];

        assert_eq!(spoken(&devices), vec!["de", "fr-ch"]);
    }

    #[test]
    fn a_device_that_asked_for_nothing_adds_nothing() {
        assert!(spoken(&[asking(None), asking(Some("  "))]).is_empty());
    }

    #[test]
    fn a_server_hearing_more_languages_than_the_collector_accepts_sends_what_fits() {
        let devices: Vec<DeviceHints> = (0..MAX_TAGS + 10)
            .map(|i| asking(Some(&format!("l{i:03}"))))
            .collect();

        assert_eq!(spoken(&devices).len(), MAX_TAGS);
    }

    #[test]
    fn the_set_is_sorted_so_two_servers_that_agree_send_the_same_bytes() {
        let devices = [
            asking(Some("pt-br")),
            asking(Some("EN")),
            asking(Some("de")),
        ];

        assert_eq!(spoken(&devices), vec!["de", "en", "pt-br"]);
    }
}
