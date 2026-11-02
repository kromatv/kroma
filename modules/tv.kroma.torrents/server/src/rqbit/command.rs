//! What rqbit is started with. Every rule about what may leave outside the tunnel
//! is here, as flags.

use super::RqbitConfig;

const SOCKS_ENV: &str = "RQBIT_SOCKS_PROXY_URL";
const PEER_CONNECT_TIMEOUT: &str = "10s";

pub(super) fn arguments(cfg: &RqbitConfig) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-v".into(),
        "warn".into(),
        "--http-api-listen-addr".into(),
        format!("127.0.0.1:{}", cfg.api_port),
        "--disable-upnp-port-forward".into(),
        "--disable-lsd".into(),
        "--peer-connect-timeout".into(),
        PEER_CONNECT_TIMEOUT.into(),
    ];
    if cfg.sealed {
        args.extend(
            [
                "--disable-dht",
                "--disable-trackers",
                "--disable-tcp-listen",
                "--ipv4-only",
            ]
            .map(String::from),
        );
    } else {
        args.extend([
            "--disable-dht-persistence".into(),
            "--listen-port".into(),
            cfg.listen_port.to_string(),
        ]);
    }
    if let Some(bps) = cfg.download_bps.filter(|bps| *bps > 0) {
        args.extend(["--ratelimit-download".into(), bps.to_string()]);
    }
    if let Some(bps) = cfg.upload_bps.filter(|bps| *bps > 0) {
        args.extend(["--ratelimit-upload".into(), bps.to_string()]);
    }
    args.extend(["server".into(), "start".into(), "--fastresume".into()]);
    args.extend([
        "--persistence-location".into(),
        cfg.session_dir.to_string_lossy().into_owned(),
        cfg.download_dir.to_string_lossy().into_owned(),
    ]);
    args
}

pub(super) fn environment(cfg: &RqbitConfig) -> Vec<(String, String)> {
    cfg.socks_proxy_url
        .iter()
        .map(|url| (SOCKS_ENV.to_string(), url.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    const BRIDGE: &str = "{gateway:peers.vpn}";

    fn has(args: &[String], flag: &str) -> bool {
        args.iter().any(|arg| arg == flag)
    }

    fn value_of<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
        let at = args.iter().position(|arg| arg == flag)?;
        args.get(at + 1).map(String::as_str)
    }

    #[test]
    fn behind_the_vpn_nothing_leaves_outside_the_socks_tunnel() {
        let cfg = RqbitConfig {
            socks_proxy_url: Some(BRIDGE.into()),
            sealed: true,
            listen_port: 51413,
            ..RqbitConfig::default()
        };

        let args = arguments(&cfg);

        assert!(has(&args, "--disable-dht"));
        assert!(has(&args, "--disable-trackers"));
        assert!(has(&args, "--disable-tcp-listen"));
        assert!(has(&args, "--disable-lsd"));
        assert!(has(&args, "--disable-upnp-port-forward"));
        assert!(has(&args, "--ipv4-only"));
        assert!(!has(&args, "--listen-port"));
        assert!(!has(&args, "--experimental-enable-utp-listen"));
        assert_eq!(
            environment(&cfg),
            [("RQBIT_SOCKS_PROXY_URL".to_string(), BRIDGE.to_string())]
        );
    }

    #[test]
    fn without_a_vpn_the_engine_keeps_its_dht_trackers_and_listener() {
        let cfg = RqbitConfig {
            listen_port: 51413,
            ..RqbitConfig::default()
        };

        let args = arguments(&cfg);

        assert!(!has(&args, "--disable-dht"));
        assert!(!has(&args, "--disable-trackers"));
        assert!(!has(&args, "--disable-tcp-listen"));
        assert_eq!(value_of(&args, "--listen-port"), Some("51413"));
        assert!(environment(&cfg).is_empty());
    }

    #[test]
    fn through_the_gateway_with_no_vpn_the_engine_keeps_its_dht_trackers_and_listener() {
        let cfg = RqbitConfig {
            socks_proxy_url: Some("{gateway:peers}".into()),
            ..RqbitConfig::default()
        };

        let args = arguments(&cfg);

        assert!(!has(&args, "--disable-dht"));
        assert!(!has(&args, "--disable-trackers"));
        assert!(!has(&args, "--disable-tcp-listen"));
        assert!(!has(&args, "--ipv4-only"));
        assert_eq!(environment(&cfg)[0].1, "{gateway:peers}");
    }

    #[test]
    fn without_a_vpn_local_service_discovery_and_router_forwarding_stay_off() {
        let args = arguments(&RqbitConfig::default());

        assert!(has(&args, "--disable-lsd"));
        assert!(has(&args, "--disable-upnp-port-forward"));
        assert!(!has(&args, "--experimental-enable-utp-listen"));
    }

    #[test]
    fn the_api_binds_loopback_and_no_secret_or_proxy_reaches_the_command_line() {
        let cfg = RqbitConfig {
            socks_proxy_url: Some(BRIDGE.into()),
            api_port: 27001,
            ..RqbitConfig::default()
        };

        let args = arguments(&cfg);

        assert_eq!(
            value_of(&args, "--http-api-listen-addr"),
            Some("127.0.0.1:27001")
        );
        assert!(!args.iter().any(|arg| arg.contains("gateway")));
    }

    #[test]
    fn the_session_folder_and_the_downloads_end_the_command() {
        let cfg = RqbitConfig {
            session_dir: PathBuf::from("/data/session"),
            download_dir: PathBuf::from("/data/downloads"),
            ..RqbitConfig::default()
        };

        let args = arguments(&cfg);

        assert_eq!(
            value_of(&args, "--persistence-location"),
            Some("/data/session")
        );
        assert_eq!(args.last().map(String::as_str), Some("/data/downloads"));
        assert!(has(&args, "--fastresume"));
    }

    #[test]
    fn a_ceiling_of_zero_is_no_ceiling() {
        let cfg = RqbitConfig {
            download_bps: Some(1024),
            upload_bps: Some(0),
            ..RqbitConfig::default()
        };

        let args = arguments(&cfg);

        assert_eq!(value_of(&args, "--ratelimit-download"), Some("1024"));
        assert!(!has(&args, "--ratelimit-upload"));
    }
}
