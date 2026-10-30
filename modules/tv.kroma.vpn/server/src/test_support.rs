use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostCtx;

use crate::provision;
use crate::Vpn;

pub const RUNNING: &str = "#!/bin/sh\nexec sleep 30\n";
pub const EXITING: &str = "#!/bin/sh\nexit 3\n";
pub const WG_CONFIG: &str = "[Interface]\nAddress = 10.2.0.2/32, 2a07:b944::2:2/128\nPrivateKey = KEY\n[Peer]\nAllowedIPs = 0.0.0.0/0, ::/0\n";

pub fn configured_host() -> StubHost {
    StubHost::new()
        .with_setting("vpnWgConfig", serde_json::json!(WG_CONFIG))
        .with_setting("vpnLocalPort", serde_json::json!(25999))
}

pub fn vpn_for(host: &StubHost) -> Arc<Vpn> {
    Vpn::new(host.data_dir().to_path_buf())
}

#[cfg(unix)]
pub fn install_script(data_dir: &Path, body: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;

    let path = provision::cached_path(data_dir);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, body).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
    let asset = provision::asset().expect("a pinned wireproxy build for the test platform");
    std::fs::write(provision::sha256_path(data_dir), asset.sha256).unwrap();
    path
}

pub async fn eventually<F, Fut>(mut probe: F)
where
    F: FnMut() -> Fut,
    Fut: Future<Output = bool>,
{
    for _ in 0..200 {
        if probe().await {
            return;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("condition not met in time");
}
