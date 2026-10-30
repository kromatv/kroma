//! The environment a sidecar starts with: what a process needs to run and
//! reach the network, and nothing of the server's own configuration.

use std::ffi::OsString;

const PASSED: [&str; 26] = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "LANGUAGE",
    "TZ",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LD_LIBRARY_PATH",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "CURL_CA_BUNDLE",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "RUST_LOG",
    "RUST_BACKTRACE",
    "KROMA_MODULE_LOG",
];

const PASSED_PREFIXES: [&str; 2] = ["LC_", "LIBVA_"];

const PASSTHROUGH_VAR: &str = "KROMA_MODULE_ENV";

const MODULE_SETTINGS: [&str; 1] = ["KROMA_EMBED_MODEL_DIR"];

// A third-party module is a separate program: the server's secrets and
// settings stay in the server, and the module gets what the host API hands it.
pub(crate) fn inherited<I>(parent: I) -> Vec<(OsString, OsString)>
where
    I: IntoIterator<Item = (OsString, OsString)>,
{
    let parent: Vec<(OsString, OsString)> = parent.into_iter().collect();
    let extra: Vec<String> = parent
        .iter()
        .find(|(name, _)| name == PASSTHROUGH_VAR)
        .and_then(|(_, value)| value.to_str())
        .map(|list| {
            list.split(',')
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    parent
        .into_iter()
        .filter(|(name, _)| {
            name.to_str()
                .is_some_and(|name| is_passed(name) || extra.iter().any(|e| e == name))
        })
        .collect()
}

fn is_passed(name: &str) -> bool {
    PASSED.contains(&name)
        || MODULE_SETTINGS.contains(&name)
        || PASSED_PREFIXES
            .iter()
            .any(|prefix| name.starts_with(prefix))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> Vec<(OsString, OsString)> {
        pairs
            .iter()
            .map(|(k, v)| (OsString::from(k), OsString::from(v)))
            .collect()
    }

    fn names(vars: &[(OsString, OsString)]) -> Vec<String> {
        vars.iter()
            .map(|(k, _)| k.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn a_sidecar_keeps_what_a_process_needs_to_run() {
        let kept = inherited(env(&[
            ("PATH", "/usr/bin"),
            ("LC_ALL", "fr_FR.UTF-8"),
            ("LIBVA_DRIVERS_PATH", "/opt/va"),
            ("HTTPS_PROXY", "http://proxy:3128"),
            ("KROMA_EMBED_MODEL_DIR", "/models"),
        ]));

        assert_eq!(
            names(&kept),
            [
                "PATH",
                "LC_ALL",
                "LIBVA_DRIVERS_PATH",
                "HTTPS_PROXY",
                "KROMA_EMBED_MODEL_DIR"
            ]
        );
    }

    #[test]
    fn the_servers_secrets_and_settings_stay_in_the_server() {
        let kept = inherited(env(&[
            ("KROMA_TMDB_API_KEY", "secret"),
            ("KROMA_HOST", "0.0.0.0"),
            ("AWS_SECRET_ACCESS_KEY", "secret"),
            ("DATABASE_URL", "postgres://u:p@db"),
        ]));

        assert!(kept.is_empty(), "{:?}", names(&kept));
    }

    #[test]
    fn an_operator_can_pass_a_variable_by_name() {
        let kept = inherited(env(&[
            (PASSTHROUGH_VAR, "CUDA_VISIBLE_DEVICES, HF_HOME"),
            ("CUDA_VISIBLE_DEVICES", "0"),
            ("HF_HOME", "/cache"),
            ("OTHER", "x"),
        ]));

        assert_eq!(names(&kept), ["CUDA_VISIBLE_DEVICES", "HF_HOME"]);
    }
}
