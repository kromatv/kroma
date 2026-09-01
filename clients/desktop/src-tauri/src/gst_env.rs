use std::path::Path;

const PLUGIN_PATH_VARS: [&str; 2] = ["GST_PLUGIN_SYSTEM_PATH_1_0", "GST_PLUGIN_SYSTEM_PATH"];

/// Prune the AppImage's GStreamer plugin path to the entries that exist, and unset
/// it when none do. Tauri's AppRun prepends `$APPDIR/usr/lib/gstreamer-1.0` - never
/// created with `bundleMediaFramework: false` - to whatever the host exported, and
/// setting the variable REPLACES GStreamer's built-in system path. A host that
/// leaves it unset (SteamOS) is therefore left searching one missing directory and
/// one empty entry, so every element vanishes; a host that sets it (Debian, Ubuntu)
/// keeps a real second entry and hides the fault.
pub fn sanitize_plugin_path() {
    for var in PLUGIN_PATH_VARS {
        let Ok(value) = std::env::var(var) else { continue };
        match kept_entries(&value, &|entry| Path::new(entry).is_dir()) {
            Some(kept) => std::env::set_var(var, kept),
            None => std::env::remove_var(var),
        }
    }
}

fn kept_entries(value: &str, is_dir: &dyn Fn(&str) -> bool) -> Option<String> {
    let kept: Vec<&str> = value
        .split(':')
        .filter(|entry| !entry.is_empty() && is_dir(entry))
        .collect();
    (!kept.is_empty()).then(|| kept.join(":"))
}

#[cfg(test)]
mod tests {
    use super::kept_entries;

    const BUNDLE: &str = "/appdir/usr/lib/gstreamer-1.0";
    const HOST: &str = "/usr/lib/gstreamer-1.0";

    fn only_host(entry: &str) -> bool {
        entry == HOST
    }

    #[test]
    fn drops_the_path_a_host_that_exports_nothing_leaves_behind() {
        let value = format!("{BUNDLE}:");

        let kept = kept_entries(&value, &only_host);

        assert_eq!(kept, None);
    }

    #[test]
    fn drops_a_lone_missing_bundle_directory() {
        let kept = kept_entries(BUNDLE, &only_host);

        assert_eq!(kept, None);
    }

    #[test]
    fn keeps_the_host_directory_beside_a_missing_bundle_directory() {
        let value = format!("{BUNDLE}:{HOST}");

        let kept = kept_entries(&value, &only_host);

        assert_eq!(kept.as_deref(), Some(HOST));
    }

    #[test]
    fn leaves_a_list_whose_entries_all_exist_untouched() {
        let value = format!("{HOST}:{BUNDLE}");

        let kept = kept_entries(&value, &|_| true);

        assert_eq!(kept.as_deref(), Some(value.as_str()));
    }

    #[test]
    fn drops_empty_entries_from_a_list_that_survives() {
        let value = format!(":{HOST}::");

        let kept = kept_entries(&value, &only_host);

        assert_eq!(kept.as_deref(), Some(HOST));
    }
}
