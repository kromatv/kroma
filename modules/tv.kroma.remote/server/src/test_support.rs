use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use kroma_module_sdk::domain::{LibraryScope, User};
use kroma_module_sdk::host::testing::StubHost;

use crate::access::RemoteAccess;
use crate::provision;

pub const RUNNING: &str = "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo \"cloudflared version 2024.1.0\"; exit 0; fi\necho hello\nexec sleep 30\n";
pub const EXITING: &str = "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo \"cloudflared version 2024.1.0\"; exit 0; fi\necho bye\nexit 3\n";
pub const TOKEN: &str = "eyJhIjoiZmFrZS10dW5uZWwtdG9rZW4ifQ";

pub fn user() -> User {
    User {
        id: "u1".into(),
        email: "ana@kroma.tv".into(),
        username: "ana".into(),
        avatar_url: None,
        language: None,
        audio_language: None,
        subtitle_language: None,
        permissions: Vec::new(),
        libraries: LibraryScope::All,
        created_at: "2026-01-01T00:00:00Z".into(),
        has_pin: false,
    }
}

pub fn host() -> StubHost {
    StubHost::new().with_session("tok", user())
}

pub fn remote_for(host: &StubHost) -> Arc<RemoteAccess> {
    use kroma_module_sdk::host::HostCtx;
    RemoteAccess::new(host.data_dir().to_path_buf())
}

pub fn enabled(host: StubHost) -> StubHost {
    host.with_setting("remoteAccess", serde_json::json!(true))
        .with_setting("remoteAccessToken", serde_json::json!(TOKEN))
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

pub fn install_inert_file(data_dir: &Path) -> PathBuf {
    let path = provision::cached_path(data_dir);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, "not a program").unwrap();
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
