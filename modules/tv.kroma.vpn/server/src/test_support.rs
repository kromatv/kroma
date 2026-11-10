use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostCtx;

use crate::bridge::Bridge;
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

pub fn bridge_for(host: &StubHost) -> Arc<Bridge> {
    let dir = host.data_dir().join("vpn");
    Bridge::new(dir.clone(), dir)
}

#[cfg(unix)]
pub fn install_script(data_dir: &Path, body: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;

    let path = provision::cached_path(data_dir);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, body).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
    path
}

pub async fn eventually<F, Fut>(mut probe: F)
where
    F: FnMut() -> Fut,
    Fut: Future<Output = bool>,
{
    for _ in 0..480 {
        if probe().await {
            return;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("condition not met in time");
}

pub const TOKEN: &str = "admin";

/// A host with an admin signed in under [`TOKEN`].
pub fn signed_in() -> StubHost {
    use kroma_module_sdk::domain::{LibraryScope, Permission, User};
    StubHost::new().with_session(
        TOKEN,
        User {
            id: "u1".into(),
            email: "a@b.c".into(),
            username: "ana".into(),
            avatar_url: None,
            language: None,
            audio_language: None,
            subtitle_language: None,
            permissions: vec![Permission::SettingsManage],
            libraries: LibraryScope::All,
            created_at: "2024-01-01T00:00:00Z".into(),
            has_pin: false,
        },
    )
}

/// One request to `router` as the admin, answering the status and the JSON body.
pub async fn call(
    router: axum::Router<StubHost>,
    host: &StubHost,
    method: &str,
    path: &str,
    body: serde_json::Value,
) -> (axum::http::StatusCode, serde_json::Value) {
    use tower::ServiceExt as _;
    let request = axum::http::Request::builder()
        .method(method)
        .uri(path)
        .header("authorization", format!("Bearer {TOKEN}"))
        .header("content-type", "application/json")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap();
    let response = router
        .with_state(host.clone())
        .oneshot(request)
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null),
    )
}
