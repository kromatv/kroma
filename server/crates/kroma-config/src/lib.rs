//! Runtime configuration, sourced entirely from environment variables with
//! sensible defaults so the server runs out-of-the-box.

use std::env;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;

// Public app key, safe to commit; KROMA_TMDB_API_KEY overrides it per install.
const BUILTIN_TMDB_API_KEY: &str = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiYjI2M2YzMGNlNGY5MjJjYzkxODAwMTc4NzIyYmQ2ZiIsIm5iZiI6MTU1NTQyMzg5MS4yNDg5OTk4LCJzdWIiOiI1Y2I1ZTI5MzBlMGEyNjZiOWJlZDJjNTEiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.n7C78ISAFNtk1To3rCSqwdGcM2c72jPslotoU3UCtxc";

/// Resolved server configuration. `from_env` is the only real constructor; the
/// derived `Default` exists so tests can build a stub with `..Default::default()`.
#[derive(Debug, Clone, Default)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub media_dirs: Vec<PathBuf>,
    pub movies_dirs: Vec<PathBuf>,
    pub series_dirs: Vec<PathBuf>,
    pub data_dir: PathBuf,
    pub tmdb_api_key: Option<String>,
    pub tmdb_language: String,
    pub tmdb_enrich: bool,
    pub web_url: Option<String>,
    pub web_dir: Option<PathBuf>,
    // Every `*_override` is `None` = defer to the stored admin setting, `Some` =
    // env pins it and wins over the toggle.
    pub https_override: Option<bool>,
    pub https_port_override: Option<u16>,
    pub tls_extra_sans: Vec<String>,
    // Only takes effect once HTTPS is actually running, and the cert-download
    // route stays on plain HTTP so a device can bootstrap trust first.
    pub https_redirect_override: Option<bool>,
    /// Peers whose `X-Forwarded-For` / `CF-Connecting-IP` may be believed:
    /// bare addresses or IPv4 CIDRs. Loopback is always trusted, which covers a
    /// proxy on the same host and is why this is empty by default.
    ///
    /// It exists for the proxy that is NOT on loopback: another container, or
    /// another machine. Without it the header is discarded and every request
    /// arrives wearing the proxy's own address, so the server cannot tell two
    /// clients apart at all: nearby pairing sees one network holding everyone,
    /// and the login guard counts the whole world as one address. Naming the
    /// proxy is what lets it see through it.
    ///
    /// Never widen this to a range clients live in. Whoever matches it can
    /// claim to be anyone.
    pub trusted_proxies: Vec<String>,
    /// Browser origins allowed to read this server's answers, on top of the
    /// ones every install trusts: this machine, this network, and a shell
    /// loaded off the device it runs on.
    ///
    /// Naming an origin lets any page served from it act as a client of this
    /// server, so name only origins you publish yourself.
    pub allowed_origins: Vec<String>,
}

impl Config {
    /// Build configuration from the process environment.
    pub fn from_env() -> Self {
        let host = env::var("KROMA_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());

        let port = env::var("KROMA_PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(4040);

        let media_dirs = env::var("KROMA_MEDIA_DIRS")
            .ok()
            .map(|raw| parse_dir_list(&raw))
            .unwrap_or_default();

        let movies_dirs = env::var("KROMA_MOVIES_DIRS")
            .ok()
            .map(|raw| parse_dir_list(&raw))
            .unwrap_or_default();

        let series_dirs = env::var("KROMA_SERIES_DIRS")
            .ok()
            .map(|raw| parse_dir_list(&raw))
            .unwrap_or_default();

        let data_dir = env::var("KROMA_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./data"));

        let tmdb_api_key = env::var("KROMA_TMDB_API_KEY")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                let builtin = BUILTIN_TMDB_API_KEY.trim();
                (!builtin.is_empty()).then(|| builtin.to_string())
            });

        let tmdb_language =
            env::var("KROMA_TMDB_LANGUAGE").unwrap_or_else(|_| "en-US".to_string());

        let tmdb_enrich = env::var("KROMA_TMDB_ENRICH")
            .map(|v| !matches!(v.trim(), "0" | "false" | "no" | "off"))
            .unwrap_or(true);

        let web_url = env::var("KROMA_WEB_URL")
            .ok()
            .map(|s| s.trim().trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty());

        let web_dir = env::var("KROMA_WEB_DIR")
            .ok()
            .map(|s| PathBuf::from(s.trim()))
            .filter(|p| !p.as_os_str().is_empty() && p.join("_shell.html").is_file());

        let https_override = env::var("KROMA_HTTPS")
            .ok()
            .map(|v| !matches!(v.trim(), "0" | "false" | "no" | "off" | ""));

        let https_port_override = env::var("KROMA_HTTPS_PORT")
            .ok()
            .and_then(|p| p.trim().parse::<u16>().ok());

        let trusted_proxies = env::var("KROMA_TRUSTED_PROXIES")
            .ok()
            .map(|raw| parse_csv_list(&raw))
            .unwrap_or_default();

        let allowed_origins = env::var("KROMA_ALLOWED_ORIGINS")
            .ok()
            .map(|raw| {
                parse_csv_list(&raw)
                    .into_iter()
                    .map(|origin| origin.trim_end_matches('/').to_string())
                    .collect()
            })
            .unwrap_or_default();

        let tls_extra_sans = env::var("KROMA_TLS_SANS")
            .ok()
            .map(|raw| parse_csv_list(&raw))
            .unwrap_or_default();

        let https_redirect_override = env::var("KROMA_HTTPS_REDIRECT")
            .ok()
            .map(|v| !matches!(v.trim(), "0" | "false" | "no" | "off" | ""));

        Config {
            host,
            port,
            media_dirs,
            movies_dirs,
            series_dirs,
            data_dir,
            tmdb_api_key,
            tmdb_language,
            tmdb_enrich,
            web_url,
            web_dir,
            https_override,
            https_port_override,
            tls_extra_sans,
            https_redirect_override,
            trusted_proxies,
            allowed_origins,
        }
    }

    /// Directory holding the auto-generated TLS certificate + key.
    pub fn tls_dir(&self) -> PathBuf {
        self.data_dir.join("tls")
    }

    /// The socket address to bind. Falls back to `0.0.0.0` if the host string
    /// does not parse as an IP.
    pub fn socket_addr(&self) -> SocketAddr {
        let ip: IpAddr = self.host.parse().unwrap_or_else(|_| {
            tracing::warn!(host = %self.host, "KROMA_HOST is not a valid IP; binding 0.0.0.0");
            IpAddr::from([0, 0, 0, 0])
        });
        SocketAddr::new(ip, self.port)
    }

    /// Path to the SQLite database file.
    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join("kroma.db")
    }

    /// Directory for rolling log files.
    pub fn logs_dir(&self) -> PathBuf {
        self.data_dir.join("logs")
    }
}

fn parse_csv_list(raw: &str) -> Vec<String> {
    raw.split([',', ' ', ';'])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

// Also accepts `;`/`,` on top of the native `:` on Unix, since NAS install
// wizards commonly show semicolon-separated examples.
fn parse_dir_list(raw: &str) -> Vec<PathBuf> {
    let seps: &[char] = if cfg!(windows) { &[';', ','] } else { &[':', ';', ','] };
    raw.split(seps)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn parse_dir_list_splits_and_trims() {
        assert_eq!(
            parse_dir_list("/a:/b:/c"),
            vec![PathBuf::from("/a"), PathBuf::from("/b"), PathBuf::from("/c")]
        );
        assert_eq!(
            parse_dir_list("/a ; /b , /c"),
            vec![PathBuf::from("/a"), PathBuf::from("/b"), PathBuf::from("/c")]
        );
    }

    #[test]
    fn parse_dir_list_drops_empty_and_whitespace_entries() {
        assert!(parse_dir_list("").is_empty());
        assert!(parse_dir_list("   ").is_empty());
        assert!(parse_dir_list(":::").is_empty());
        assert_eq!(parse_dir_list(":/only:").into_iter().count(), 1);
        assert_eq!(parse_dir_list(":/only:"), vec![PathBuf::from("/only")]);
    }

    fn cfg_with(host: &str, port: u16, data_dir: &str) -> Config {
        Config {
            host: host.into(),
            port,
            data_dir: PathBuf::from(data_dir),
            tmdb_language: "en-US".into(),
            tmdb_enrich: true,
            ..Default::default()
        }
    }

    #[test]
    fn socket_addr_parses_ipv4_ipv6_and_falls_back() {
        assert_eq!(
            cfg_with("127.0.0.1", 8080, "./data").socket_addr(),
            "127.0.0.1:8080".parse().unwrap()
        );
        assert_eq!(cfg_with("::1", 4040, "./data").socket_addr(), "[::1]:4040".parse().unwrap());
        assert_eq!(
            cfg_with("not-an-ip", 1234, "./data").socket_addr(),
            "0.0.0.0:1234".parse().unwrap()
        );
    }

    #[test]
    fn db_and_logs_paths_hang_off_the_data_dir() {
        let c = cfg_with("0.0.0.0", 4040, "/var/lib/kroma");
        assert_eq!(c.db_path(), PathBuf::from("/var/lib/kroma/kroma.db"));
        assert_eq!(c.logs_dir(), PathBuf::from("/var/lib/kroma/logs"));
    }

    const KEYS: &[&str] = &[
        "KROMA_HOST",
        "KROMA_PORT",
        "KROMA_MEDIA_DIRS",
        "KROMA_MOVIES_DIRS",
        "KROMA_SERIES_DIRS",
        "KROMA_DATA_DIR",
        "KROMA_TMDB_API_KEY",
        "KROMA_TMDB_LANGUAGE",
        "KROMA_TMDB_ENRICH",
        "KROMA_WEB_URL",
        "KROMA_WEB_DIR",
        "KROMA_TRUSTED_PROXIES",
        "KROMA_ALLOWED_ORIGINS",
    ];

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    // Recovers from a prior panicked holder so one failing assertion doesn't
    // cascade into "poisoned" failures for the rest.
    fn env_guard() -> std::sync::MutexGuard<'static, ()> {
        ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn clear_env() {
        for k in KEYS {
            env::remove_var(k);
        }
    }

    #[test]
    fn from_env_uses_defaults_when_unset() {
        let _g = env_guard();
        clear_env();

        let c = Config::from_env();
        assert_eq!(c.host, "0.0.0.0");
        assert_eq!(c.port, 4040);
        assert!(c.media_dirs.is_empty());
        assert!(c.movies_dirs.is_empty());
        assert!(c.series_dirs.is_empty());
        assert_eq!(c.data_dir, PathBuf::from("./data"));
        assert_eq!(c.tmdb_api_key.as_deref(), Some(BUILTIN_TMDB_API_KEY));
        assert_eq!(c.tmdb_language, "en-US");
        assert!(c.tmdb_enrich);
        assert!(c.web_url.is_none());
        assert!(c.web_dir.is_none());
        assert!(c.trusted_proxies.is_empty());
        assert!(c.allowed_origins.is_empty());

        clear_env();
    }

    #[test]
    fn allowed_origins_are_split_and_stripped_of_a_trailing_slash() {
        let _g = env_guard();
        clear_env();

        env::set_var("KROMA_ALLOWED_ORIGINS", "https://tv.example/, tauri://localhost ;null");
        assert_eq!(
            Config::from_env().allowed_origins,
            vec!["https://tv.example", "tauri://localhost", "null"]
        );

        clear_env();
    }

    #[test]
    fn from_env_reads_and_normalizes_every_var() {
        let _g = env_guard();
        clear_env();

        // A web dir counts only when it holds `_shell.html`.
        let web = kroma_testing::temp_dir("webdir");
        std::fs::write(web.path().join("_shell.html"), b"<html></html>").unwrap();

        env::set_var("KROMA_HOST", "127.0.0.1");
        env::set_var("KROMA_PORT", "9999");
        env::set_var("KROMA_MEDIA_DIRS", "/a:/b");
        env::set_var("KROMA_MOVIES_DIRS", "/movies");
        env::set_var("KROMA_SERIES_DIRS", "/tv;/tv2");
        env::set_var("KROMA_DATA_DIR", "/data/root");
        env::set_var("KROMA_TMDB_API_KEY", "  mykey  ");
        env::set_var("KROMA_TMDB_LANGUAGE", "fr-FR");
        env::set_var("KROMA_TMDB_ENRICH", "0");
        env::set_var("KROMA_WEB_URL", "https://kroma.example/");
        env::set_var("KROMA_WEB_DIR", web.path().to_str().unwrap());

        let c = Config::from_env();
        assert_eq!(c.host, "127.0.0.1");
        assert_eq!(c.port, 9999);
        assert_eq!(c.media_dirs, vec![PathBuf::from("/a"), PathBuf::from("/b")]);
        assert_eq!(c.movies_dirs, vec![PathBuf::from("/movies")]);
        assert_eq!(c.series_dirs, vec![PathBuf::from("/tv"), PathBuf::from("/tv2")]);
        assert_eq!(c.data_dir, PathBuf::from("/data/root"));
        assert_eq!(c.tmdb_api_key.as_deref(), Some("mykey"));
        assert_eq!(c.tmdb_language, "fr-FR");
        assert!(!c.tmdb_enrich);
        assert_eq!(c.web_url.as_deref(), Some("https://kroma.example"));
        assert_eq!(c.web_dir.as_deref(), Some(web.path()));

        clear_env();
    }

    #[test]
    fn from_env_edge_cases_for_port_key_enrich_and_webdir() {
        let _g = env_guard();
        clear_env();

        // A non-numeric port falls back to the default.
        env::set_var("KROMA_PORT", "not-a-port");
        // An explicit-but-empty key falls back to the built-in.
        env::set_var("KROMA_TMDB_API_KEY", "   ");
        // Any other enrich spelling than the off-words stays enabled.
        env::set_var("KROMA_TMDB_ENRICH", "yes-please");
        // A web dir without `_shell.html` is rejected.
        let bad = kroma_testing::temp_dir("webdir-bad");
        env::set_var("KROMA_WEB_DIR", bad.path().to_str().unwrap());

        let c = Config::from_env();
        assert_eq!(c.port, 4040);
        assert_eq!(c.tmdb_api_key.as_deref(), Some(BUILTIN_TMDB_API_KEY));
        assert!(c.tmdb_enrich);
        assert!(c.web_dir.is_none());

        for off in ["0", "false", "no", "off"] {
            env::set_var("KROMA_TMDB_ENRICH", off);
            assert!(!Config::from_env().tmdb_enrich, "{off} should disable enrich");
        }
        env::set_var("KROMA_WEB_URL", "");
        assert!(Config::from_env().web_url.is_none());

        clear_env();
    }
}
