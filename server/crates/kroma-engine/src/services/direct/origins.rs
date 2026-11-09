use std::sync::{PoisonError, RwLock};

use axum::http::uri::Authority;

const MAX_ORIGINS: usize = 8;

/// The https origins this server has been seen served at through a proxy it
/// trusts, so a page loaded from one may read the answers of the LAN route.
/// Held in memory, newest kept, a handful at most.
#[derive(Default)]
pub struct PublicOrigins {
    seen: RwLock<Vec<String>>,
}

impl PublicOrigins {
    /// Remember `https://<host>`. The caller vouches that `host` came from a
    /// proxy it trusts over https; anything that is not an authority is ignored.
    pub fn learn(&self, host: &str) {
        let Some(origin) = https_origin(host) else {
            return;
        };
        let mut seen = self.seen.write().unwrap_or_else(PoisonError::into_inner);
        if seen.contains(&origin) {
            return;
        }
        if seen.len() >= MAX_ORIGINS {
            seen.remove(0);
        }
        seen.push(origin);
    }

    pub fn contains(&self, origin: &str) -> bool {
        self.seen
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .any(|seen| seen.eq_ignore_ascii_case(origin))
    }
}

/// The origin a page served from `url` presents: scheme, host and a port that
/// is not the scheme's default.
pub fn origin_of(url: &str) -> Option<String> {
    let uri: axum::http::Uri = url.trim().parse().ok()?;
    let scheme = uri.scheme_str()?.to_ascii_lowercase();
    let authority = uri.authority()?;
    named_origin(&scheme, authority)
}

fn https_origin(host: &str) -> Option<String> {
    named_origin("https", &host.trim().parse::<Authority>().ok()?)
}

fn named_origin(scheme: &str, authority: &Authority) -> Option<String> {
    if authority.as_str().contains('@') || authority.host().is_empty() {
        return None;
    }
    let host = authority.host().to_ascii_lowercase();
    let default = match scheme {
        "https" => 443,
        "http" => 80,
        _ => return None,
    };
    Some(match authority.port_u16() {
        Some(port) if port != default => format!("{scheme}://{host}:{port}"),
        _ => format!("{scheme}://{host}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_host_seen_through_the_proxy_becomes_its_https_origin() {
        let origins = PublicOrigins::default();

        origins.learn("Kroma.Example");
        origins.learn("tv.example:8443");

        assert!(origins.contains("https://kroma.example"));
        assert!(origins.contains("https://tv.example:8443"));
        assert!(!origins.contains("http://kroma.example"));
    }

    #[test]
    fn the_default_port_is_not_part_of_the_origin() {
        let origins = PublicOrigins::default();

        origins.learn("kroma.example:443");

        assert!(origins.contains("https://kroma.example"));
    }

    #[test]
    fn something_that_is_not_a_host_is_ignored() {
        let origins = PublicOrigins::default();

        for host in ["", "user@kroma.example", "kroma.example/path", "a b"] {
            origins.learn(host);
        }

        assert!(origins.seen.read().unwrap().is_empty());
    }

    #[test]
    fn only_the_newest_handful_are_kept() {
        let origins = PublicOrigins::default();

        for n in 0..=MAX_ORIGINS {
            origins.learn(&format!("host{n}.example"));
        }

        assert!(!origins.contains("https://host0.example"));
        assert!(origins.contains(&format!("https://host{MAX_ORIGINS}.example")));
    }

    #[test]
    fn a_configured_url_names_its_origin() {
        assert_eq!(
            origin_of("https://Kroma.Example/web/").as_deref(),
            Some("https://kroma.example")
        );
        assert_eq!(
            origin_of("http://kroma.example:4040").as_deref(),
            Some("http://kroma.example:4040")
        );
        assert_eq!(origin_of("ftp://kroma.example"), None);
        assert_eq!(origin_of("not a url"), None);
    }
}
