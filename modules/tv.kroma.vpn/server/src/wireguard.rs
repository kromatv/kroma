// Rewrite a WireGuard config so the tunnel is IPv4-only: drop IPv6 entries from
// `Address` and `DNS`, and reduce `AllowedIPs` to IPv4. Everything else (keys,
// `Endpoint`, `PersistentKeepalive`) is left untouched. This keeps torrent
// traffic on IPv4, which the wireproxy bridge relays reliably (IPv6 peer
// connections stall mid-handshake) and which makes trackers hand back IPv4
// peers. Guard: if a line has no IPv4 value at all it is kept verbatim, so an
// (unusual) IPv6-only config is never left with an empty address.
pub(crate) fn ipv4_only_wg(config: &str) -> String {
    let is_v4 = |s: &str| !s.contains(':');
    let keep_v4 = |val: &str| -> Option<String> {
        let v4: Vec<&str> = val
            .split(',')
            .map(str::trim)
            .filter(|a| !a.is_empty() && is_v4(a))
            .collect();
        (!v4.is_empty()).then(|| v4.join(", "))
    };
    let mut out = Vec::new();
    for line in config.lines() {
        let trimmed = line.trim_start();
        let rewrite = |key: &str| {
            trimmed
                .strip_prefix(key)
                .map(|rest| rest.trim_start().strip_prefix('=').unwrap_or(rest).trim())
        };
        if let Some(val) = rewrite("Address") {
            match keep_v4(val) {
                Some(v4) => out.push(format!("Address = {v4}")),
                None => out.push(line.to_string()),
            }
        } else if let Some(val) = rewrite("DNS") {
            match keep_v4(val) {
                Some(v4) => out.push(format!("DNS = {v4}")),
                None => out.push(line.to_string()),
            }
        } else if trimmed.starts_with("AllowedIPs") {
            // Drop ::/0 and any IPv6 CIDR; ensure IPv4 default route remains.
            out.push("AllowedIPs = 0.0.0.0/0".to_string());
        } else {
            out.push(line.to_string());
        }
    }
    out.join("\n")
}

pub(crate) fn value_of<'a>(config: &'a str, key: &str) -> Option<&'a str> {
    config
        .lines()
        .filter_map(|line| line.trim().strip_prefix(key))
        .filter_map(|rest| rest.trim_start().strip_prefix('='))
        .map(str::trim)
        .next()
}

/// Whether two configs bring up the same tunnel: one key to one peer. Two
/// bridges on it would steal each other's replies, so they share one.
pub(crate) fn same_tunnel(a: &str, b: &str) -> bool {
    let key = |config| {
        (
            value_of(config, "PrivateKey"),
            value_of(config, "PublicKey"),
        )
    };
    let (left, right) = (key(a), key(b));
    a.trim() == b.trim() || (left.0.is_some() && left.1.is_some() && left == right)
}

#[cfg(test)]
mod tests {
    use super::ipv4_only_wg;

    #[test]
    fn strips_ipv6_from_dual_stack_config() {
        let cfg = "[Interface]\n\
                   Address = 10.2.0.2/32, 2a07:b944::2:2/128\n\
                   DNS = 10.2.0.1, 2a07:b944::2:1\n\
                   PrivateKey = KEY\n\n\
                   [Peer]\n\
                   PublicKey = PUB\n\
                   AllowedIPs = 0.0.0.0/0, ::/0\n\
                   Endpoint = 89.222.96.158:51820\n\
                   PersistentKeepalive = 25";
        let out = ipv4_only_wg(cfg);
        assert!(out.contains("Address = 10.2.0.2/32"));
        assert!(
            !out.contains("2a07:b944"),
            "IPv6 address/DNS must be gone:\n{out}"
        );
        assert!(out.contains("DNS = 10.2.0.1"));
        assert!(out.contains("AllowedIPs = 0.0.0.0/0"));
        assert!(!out.contains("::/0"));
        // Untouched lines survive.
        assert!(out.contains("Endpoint = 89.222.96.158:51820"));
        assert!(out.contains("PersistentKeepalive = 25"));
        assert!(out.contains("PrivateKey = KEY"));
    }

    #[test]
    fn ipv4_only_config_is_unchanged_semantically() {
        let cfg =
            "[Interface]\nAddress = 10.2.0.2/32\nDNS = 10.2.0.1\n[Peer]\nAllowedIPs = 0.0.0.0/0";
        let out = ipv4_only_wg(cfg);
        assert!(out.contains("Address = 10.2.0.2/32"));
        assert!(out.contains("DNS = 10.2.0.1"));
        assert!(out.contains("AllowedIPs = 0.0.0.0/0"));
    }

    #[test]
    fn ipv6_only_address_is_kept_verbatim() {
        // No IPv4 to fall back to: don't strip to an empty Address.
        let cfg = "[Interface]\nAddress = 2a07:b944::2:2/128\n[Peer]\nAllowedIPs = ::/0";
        let out = ipv4_only_wg(cfg);
        assert!(out.contains("Address = 2a07:b944::2:2/128"));
    }

    const CH: &str =
        "[Interface]\nPrivateKey = KEY\n[Peer]\nPublicKey = RELAY_CH\nEndpoint = 192.0.2.1:51820\n";

    #[test]
    fn one_key_to_one_peer_is_one_tunnel_however_the_text_differs() {
        let commented = format!("# Mullvad ch-zrh-wg-001\n{CH}");

        assert!(super::same_tunnel(CH, &commented));
    }

    #[test]
    fn one_key_to_two_peers_is_two_tunnels() {
        let se = CH.replace("RELAY_CH", "RELAY_SE");

        assert!(!super::same_tunnel(CH, &se));
    }

    #[test]
    fn two_keys_to_one_peer_are_two_tunnels() {
        let other = CH.replace("PrivateKey = KEY", "PrivateKey = OTHER");

        assert!(!super::same_tunnel(CH, &other));
    }
}
