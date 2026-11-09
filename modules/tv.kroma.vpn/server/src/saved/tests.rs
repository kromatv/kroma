use super::*;

fn proton(server: &str) -> String {
    format!(
        "[Interface]\n# Key for kroma\n# NAT-PMP (Port Forwarding) = on\nPrivateKey = k\nAddress = 10.2.0.2/32\n\n[Peer]\n# {server}\nPublicKey = p\nAllowedIPs = 0.0.0.0/0\nEndpoint = 192.0.2.1:51820\n"
    )
}

const PLAIN: &str =
    "[Interface]\nPrivateKey = k\n[Peer]\nPublicKey = p\nEndpoint = 198.51.100.7:51820\n";

#[test]
fn a_complete_config_is_wireguard_and_a_partial_one_is_not() {
    assert!(is_wireguard(&proton("CH#3")));
    assert!(!is_wireguard("[Interface]\nPrivateKey = k\n"));
    assert!(!is_wireguard("hello"));
}

#[test]
fn every_dropped_file_is_kept_once_and_named_by_its_server() {
    let dir = kroma_module_sdk::testing::temp_dir("saved-add");

    let first = add(dir.path(), &[proton("CH#3"), proton("NL#12")]).unwrap();
    let again = add(dir.path(), &[proton("CH#3")]).unwrap();

    assert_eq!(again, vec![first[0].clone()]);
    let labels: Vec<String> = views(dir.path(), "").into_iter().map(|v| v.label).collect();
    assert_eq!(labels, ["Proton VPN · CH#3", "Proton VPN · NL#12"]);
}

#[test]
fn the_config_in_use_is_marked_active() {
    let dir = kroma_module_sdk::testing::temp_dir("saved-active");
    add(dir.path(), &[proton("CH#3"), PLAIN.to_string()]).unwrap();

    let views = views(dir.path(), PLAIN);

    assert_eq!(views.iter().filter(|v| v.active).count(), 1);
    assert!(views[1].active);
    assert_eq!(views[1].label, "198.51.100.7:51820");
}

#[test]
fn a_removed_config_is_gone_and_removing_it_again_moves_nothing() {
    let dir = kroma_module_sdk::testing::temp_dir("saved-remove");
    let ids = add(dir.path(), &[proton("CH#3")]).unwrap();

    let removed = remove(dir.path(), &ids[0]).unwrap();
    let again = remove(dir.path(), &ids[0]).unwrap();

    assert!(removed);
    assert!(!again);
    assert!(find(dir.path(), &ids[0]).is_none());
}

#[test]
fn what_is_kept_is_readable_by_the_server_alone() {
    let dir = kroma_module_sdk::testing::temp_dir("saved-private");

    add(dir.path(), &[PLAIN.to_string()]).unwrap();

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(dir.path().join("saved.json"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }
}
