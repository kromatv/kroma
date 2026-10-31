//! A [`Fetch`]'s options, spelled as the curl config it hands over on stdin.

use crate::config::{header_line, option_line};
use crate::multipart::{part_line, FormPart};

use super::Fetch;

pub(super) fn bare_proxy(proxy: &str) -> Option<String> {
    let proxy = proxy.trim();
    let bare = proxy.split_once("://").map_or(proxy, |(_, rest)| rest);
    (!bare.is_empty()).then(|| bare.to_string())
}

pub(super) fn proxy_lines(proxy: &str) -> String {
    // ipv4: the only SOCKS proxy (a WireGuard bridge) is IPv4-only, and a
    // dual-stack host can otherwise resolve to an AAAA the tunnel can't route.
    let mut lines = String::from("ipv4\n");
    lines.push_str(&option_line("socks5-hostname", proxy));
    // An empty list overrides `NO_PROXY`, which would send its hosts around the
    // tunnel.
    lines.push_str(&option_line("noproxy", ""));
    lines
}

impl Fetch {
    pub(super) fn form_config(&self, url: &str, fields: &[(&str, &str)]) -> String {
        let mut config = self.base_config();
        // Only with no fields: a data line is what makes curl POST, and naming
        // the method outright would also make it re-POST to a redirect instead
        // of following with GET, which an indexer's HTML login form expects.
        if fields.is_empty() {
            config.push_str(&option_line("request", "POST"));
            config.push_str(&option_line("data", ""));
        }
        for (k, v) in fields {
            config.push_str(&option_line("data-urlencode", &format!("{k}={v}")));
        }
        config.push_str(&option_line("url", url));
        config
    }

    pub(super) fn multipart_config(&self, url: &str, parts: &[(&str, FormPart<'_>)]) -> String {
        let mut config = self.base_config();
        for (name, part) in parts {
            config.push_str(&part_line(name, *part));
        }
        config.push_str(&option_line("url", url));
        config
    }

    pub(super) fn base_config(&self) -> String {
        // location: indexer download links commonly redirect. No fail: we surface
        // the status ourselves so error bodies (and 409 handshakes) stay readable.
        // proto: a URL from an indexer or a catalog must not reach `file://`.
        let protocols = if self.https_only {
            "=https"
        } else {
            "=http,https"
        };
        let mut config = String::from("silent\nshow-error\n");
        config.push_str(&option_line("proto", protocols));
        config.push_str(&option_line("proto-redir", protocols));
        if self.follow_redirects {
            config.push_str("location\n");
        }
        if let Some(hops) = self.max_redirects {
            config.push_str(&option_line("max-redirs", &hops.to_string()));
        }
        config.push_str(&option_line("max-time", &self.max_time_secs.to_string()));
        if let Some(bytes) = self.max_bytes {
            config.push_str(&option_line("max-filesize", &bytes.to_string()));
        }
        if self.http2 {
            config.push_str("http2\n");
        }
        if let Some((user, password)) = &self.digest {
            config.push_str("digest\n");
            config.push_str(&option_line("user", &format!("{user}:{password}")));
        }
        if let Some(jar) = &self.cookie_jar {
            let jar = jar.to_string_lossy();
            config.push_str(&option_line("cookie-jar", &jar));
            config.push_str(&option_line("cookie", &jar));
        }
        for (k, v) in &self.headers {
            config.push_str(&header_line(k, v));
        }
        config
    }
}
