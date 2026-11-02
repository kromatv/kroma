use crate::ModuleManifest;

const MAX_HELPER_NAME: usize = 64;

impl ModuleManifest {
    /// The first helper this manifest pins under a name the host cannot fetch it
    /// as, worded for its author, or `None`. A helper's name is letters, digits,
    /// `-` and `_`: the host keeps its own files beside helpers under names with a
    /// dot.
    pub fn helpers_problem(&self) -> Option<String> {
        self.helpers
            .keys()
            .find(|name| !is_helper_name(name))
            .map(|name| format!("helpers: \"{name}\" is not a helper name (letters, digits, - and _)"))
    }
}

fn is_helper_name(name: &str) -> bool {
    (1..=MAX_HELPER_NAME).contains(&name.len())
        && name.starts_with(|c: char| c.is_ascii_alphanumeric())
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use crate::ModuleManifest;

    fn pinning(name: &str) -> ModuleManifest {
        serde_json::from_value(serde_json::json!({
            "id": "tv.kroma.torrents", "name": "Torrents", "version": "1.0.0",
            "helpers": { name: { "assets": { "linux-x86_64": {
                "url": "https://example.org/helper", "sha256": "00",
            } } } },
        }))
        .unwrap()
    }

    #[test]
    fn the_helpers_first_party_modules_pin_are_helper_names() {
        let names = ["rqbit", "wireproxy", "cloudflared", "yt-dlp", "my_tool2"];

        let problems: Vec<Option<String>> = names.iter().map(|name| pinning(name).helpers_problem()).collect();

        assert!(problems.iter().all(Option::is_none), "{problems:?}");
    }

    #[test]
    fn a_helper_named_like_a_file_the_host_keeps_is_refused() {
        let names = ["module.cwasm", "module.stamp", "rqbit.pid", "rqbit.download", "module.json"];

        let problems: Vec<String> = names.iter().filter_map(|name| pinning(name).helpers_problem()).collect();

        assert_eq!(problems.len(), names.len(), "{problems:?}");
        assert_eq!(
            problems[0],
            "helpers: \"module.cwasm\" is not a helper name (letters, digits, - and _)"
        );
    }

    #[test]
    fn a_helper_named_with_a_path_or_nothing_is_refused() {
        let names = ["", "..", "bin/rqbit", "-rqbit", &"x".repeat(65)];

        let refused = names.iter().all(|name| pinning(name).helpers_problem().is_some());

        assert!(refused);
    }
}
