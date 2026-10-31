use super::*;

const OWN_PORTS: [u16; 2] = [4040, 25345];

fn target(host: &str) -> WebTarget {
    target_at(host, 443)
}

fn target_at(host: &str, port: u16) -> WebTarget {
    WebTarget {
        https: true,
        host: host.to_string(),
        port,
    }
}

fn rule(
    id: &str,
    caller: Option<&str>,
    purpose: Option<&str>,
    host: Option<&str>,
    action: Action,
) -> Rule {
    Rule {
        id: id.to_string(),
        caller: caller.map(str::to_string),
        purpose: purpose.map(str::to_string),
        host: host.map(str::to_string),
        action,
        note: None,
    }
}

fn policy(default_action: DefaultAction, rules: Vec<Rule>) -> NetworkRules {
    NetworkRules {
        default_action,
        rules,
    }
}

fn assert_verdict(
    rules: &NetworkRules,
    (caller, purpose, host): (&str, &str, &str),
    expected: (Action, Option<&str>),
) {
    let (action, rule) = decide(rules, caller, purpose, &target(host), &OWN_PORTS);
    assert_eq!(
        (action, rule.as_deref()),
        expected,
        "{caller} {purpose} {host}"
    );
}

#[test]
fn the_first_matching_rule_wins() {
    let rules = policy(
        DefaultAction::Allow,
        vec![
            rule("vpn-peers", None, Some("peers-announce"), None, Action::Vpn),
            rule("block-all", None, None, None, Action::Block),
        ],
    );

    let cases = [
        (
            "tv.kroma.torrents",
            "peers-announce",
            "tracker.example",
            (Action::Vpn, Some("vpn-peers")),
        ),
        (
            "tv.kroma.torrents",
            "torrent-file",
            "tracker.example",
            (Action::Block, Some("block-all")),
        ),
        (
            CORE,
            "metadata",
            "api.themoviedb.org",
            (Action::Block, Some("block-all")),
        ),
    ];

    for (caller, purpose, host, expected) in cases {
        assert_verdict(&rules, (caller, purpose, host), expected);
    }
}

#[test]
fn a_rule_scoped_to_a_caller_leaves_every_other_caller_alone() {
    let rules = policy(
        DefaultAction::Allow,
        vec![rule(
            "indexer-vpn",
            Some("tv.kroma.indexer"),
            None,
            None,
            Action::Vpn,
        )],
    );

    let cases = [
        ("tv.kroma.indexer", (Action::Vpn, Some("indexer-vpn"))),
        ("tv.kroma.torznab", (Action::Direct, None)),
        (CORE, (Action::Direct, None)),
    ];

    for (caller, expected) in cases {
        assert_verdict(&rules, (caller, "indexer", "tracker.example"), expected);
    }
}

#[test]
fn a_suffix_pattern_matches_the_domain_and_every_name_under_it() {
    let rules = policy(
        DefaultAction::Allow,
        vec![rule(
            "no-ads",
            None,
            None,
            Some("*.ads.example"),
            Action::Block,
        )],
    );

    let cases = [
        ("cdn.ads.example", Action::Block),
        ("a.b.ads.example", Action::Block),
        ("CDN.Ads.Example.", Action::Block),
        ("ads.example", Action::Block),
        ("badads.example", Action::Direct),
        ("ads.example.org", Action::Direct),
    ];

    for (host, expected) in cases {
        assert_eq!(
            decide(&rules, CORE, "artwork", &target(host), &OWN_PORTS).0,
            expected,
            "{host}"
        );
    }
}

#[test]
fn an_exact_host_matches_that_host_only() {
    let rules = policy(
        DefaultAction::Block,
        vec![rule(
            "tmdb",
            None,
            None,
            Some("api.themoviedb.org"),
            Action::Direct,
        )],
    );

    let cases = [
        ("api.themoviedb.org", (Action::Direct, Some("tmdb"))),
        ("image.themoviedb.org", (Action::Block, None)),
    ];

    for (host, expected) in cases {
        assert_verdict(&rules, (CORE, "metadata", host), expected);
    }
}

#[test]
fn the_default_decides_what_no_rule_matches() {
    let cases = [
        (DefaultAction::Allow, Action::Direct),
        (DefaultAction::Block, Action::Block),
    ];

    for (default_action, expected) in cases {
        let rules = policy(default_action, Vec::new());
        assert_verdict(
            &rules,
            (CORE, "updates", "api.github.com"),
            (expected, None),
        );
    }
}

#[test]
fn a_link_local_address_is_refused_whatever_a_rule_says() {
    let rules = policy(
        DefaultAction::Allow,
        vec![rule("allow-all", None, None, None, Action::Direct)],
    );

    for host in ["169.254.169.254", "fe80::1", "::ffff:169.254.0.1"] {
        for caller in [CORE, "tv.kroma.indexer"] {
            assert_verdict(
                &rules,
                (caller, "metadata", host),
                (Action::Block, Some(GUARD_LINK_LOCAL)),
            );
        }
    }
}

#[test]
fn this_servers_own_ports_are_refused_to_a_module_and_open_to_the_core() {
    let rules = policy(
        DefaultAction::Allow,
        vec![rule("allow-all", None, None, None, Action::Direct)],
    );

    for host in [
        "127.0.0.1",
        "127.8.0.1",
        "::1",
        "0.0.0.0",
        "::ffff:127.0.0.1",
        "localhost",
        "api.localhost.",
    ] {
        for port in OWN_PORTS {
            let at = target_at(host, port);
            assert_eq!(
                decide(
                    &rules,
                    "tv.kroma.engine.qbittorrent",
                    "download-client",
                    &at,
                    &OWN_PORTS
                ),
                (Action::Block, Some(GUARD_LOOPBACK.to_string())),
                "{host}:{port}"
            );
            assert_eq!(
                decide(&rules, CORE, "push", &at, &OWN_PORTS),
                (Action::Direct, Some("allow-all".to_string())),
                "{host}:{port}"
            );
        }
    }
}

#[test]
fn a_download_client_on_this_machine_stays_reachable() {
    let rules = policy(DefaultAction::Allow, Vec::new());

    for host in ["127.0.0.1", "localhost", "::1"] {
        assert_eq!(
            decide(
                &rules,
                "tv.kroma.engine.qbittorrent",
                "download-client",
                &target_at(host, 8080),
                &OWN_PORTS
            ),
            (Action::Direct, None),
            "{host}"
        );
    }
}

#[test]
fn a_vpn_rule_for_a_local_host_goes_direct() {
    let rules = policy(
        DefaultAction::Allow,
        vec![rule("all-vpn", None, None, None, Action::Vpn)],
    );

    let cases = [
        ("192.168.1.20", (Action::Direct, Some("all-vpn"))),
        ("nas.local", (Action::Direct, Some("all-vpn"))),
        ("qbittorrent", (Action::Direct, Some("all-vpn"))),
        ("tracker.example", (Action::Vpn, Some("all-vpn"))),
    ];

    for (host, expected) in cases {
        assert_verdict(&rules, ("tv.kroma.indexer", "indexer", host), expected);
    }
}

#[test]
fn a_block_rule_still_refuses_a_local_host() {
    let rules = policy(
        DefaultAction::Allow,
        vec![rule(
            "no-lan",
            None,
            None,
            Some("192.168.1.20"),
            Action::Block,
        )],
    );

    assert_verdict(
        &rules,
        ("tv.kroma.roku", "roku", "192.168.1.20"),
        (Action::Block, Some("no-lan")),
    );
}
