#![allow(dead_code)]

use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::http::{Request, StatusCode};
use kroma_module_host::testing::StubHost;
use kroma_module_host::{
    NetworkAction, NetworkAnswer, NetworkAsk, NetworkFlow, NetworkPolicy, NetworkPolicyOf,
    SettingReach, SettingReachOf,
};
use kroma_module_supervisor::{Supervisor, SupervisorConfig};
use tower::ServiceExt;

/// The token every sidecar shares, which authenticates a caller without naming it.
pub const FABRIC: &str = "fabric-host-token";

pub const NOTHING_WITHHELD: SettingReachOf = SettingReachOf(|_| SettingReach::Any);

/// A supervisor over a modules directory that removes itself, so a test can put a
/// manifest where the callback reads declarations from.
pub struct Modules {
    pub supervisor: Arc<Supervisor>,
    pub network: Arc<RecordingPolicy>,
    dir: kroma_testing::TempDir,
}

/// A network policy that answers `direct` under the rule `"stub"` and keeps
/// every ask and every flow, with the caller the callback named.
#[derive(Default)]
pub struct RecordingPolicy {
    pub asked: Mutex<Vec<(String, NetworkAsk)>>,
    pub flows: Mutex<Vec<(String, NetworkFlow)>>,
}

impl NetworkPolicy for RecordingPolicy {
    fn decide(&self, caller: &str, ask: &NetworkAsk) -> NetworkAnswer {
        self.asked
            .lock()
            .unwrap()
            .push((caller.to_string(), ask.clone()));
        NetworkAnswer {
            action: NetworkAction::Direct,
            proxy: None,
            rule: Some("stub".into()),
            reason: None,
        }
    }

    fn record_flows(&self, caller: &str, flows: Vec<NetworkFlow>) {
        let mut kept = self.flows.lock().unwrap();
        kept.extend(flows.into_iter().map(|flow| (caller.to_string(), flow)));
    }
}

impl Modules {
    pub fn new(tag: &str) -> Self {
        let dir = kroma_testing::temp_dir(tag);
        let supervisor = Supervisor::new(SupervisorConfig {
            modules_dir: dir.path().to_path_buf(),
            core_port: 0,
            host_token: FABRIC.into(),
            db_path: dir.path().join("kroma.db"),
            data_dir: dir.path().to_path_buf(),
            reserved_ids: Vec::new(),
            server_version: "0.0.0-test".into(),
            log_line: None,
        });
        Self {
            supervisor,
            network: Arc::default(),
            dir,
        }
    }

    /// Install `id` with the `settings` block it declares, as JSON, or `None` for a
    /// manifest predating the field.
    pub fn declaring(self, id: &str, settings: Option<&str>) -> Self {
        let dir = self.dir.path().join(id);
        std::fs::create_dir_all(&dir).unwrap();
        let settings = settings.map_or(String::new(), |s| format!(r#", "settings": {s}"#));
        std::fs::write(
            dir.join("module.json"),
            format!(
                r#"{{ "schemaVersion": {}, "id": "{id}", "name": "{id}", "version": "1.0.0"{settings} }}"#,
                kroma_module_manifest::MODULE_SCHEMA_VERSION,
            ),
        )
        .unwrap();
        self
    }

    pub fn token(&self, id: &str) -> String {
        self.supervisor.module_token(id)
    }

    pub fn router<S>(&self, reach: SettingReachOf) -> axum::Router<S>
    where
        S: kroma_module_host::HostCtx + Clone + Send + Sync + 'static,
    {
        kroma_module_supervisor::host_router::<S>(
            self.supervisor.clone(),
            reach,
            NetworkPolicyOf(self.network.clone()),
        )
    }

    pub async fn post(&self, uri: &str, token: Option<&str>, body: String) -> (StatusCode, String) {
        let mut req = Request::builder().method("POST").uri(uri);
        if let Some(t) = token {
            req = req.header("authorization", format!("Bearer {t}"));
        }
        let res = self
            .router::<StubHost>(NOTHING_WITHHELD)
            .with_state(StubHost::new())
            .oneshot(
                req.header("content-type", "application/json")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), 64 * 1024)
            .await
            .unwrap();
        (status, String::from_utf8(bytes.to_vec()).unwrap())
    }

    pub async fn get(
        &self,
        host: StubHost,
        uri: &str,
        token: Option<&str>,
    ) -> (StatusCode, String) {
        let mut req = Request::builder().method("GET").uri(uri);
        if let Some(t) = token {
            req = req.header("authorization", format!("Bearer {t}"));
        }
        let res = self
            .router::<StubHost>(NOTHING_WITHHELD)
            .with_state(host)
            .oneshot(req.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), 64 * 1024)
            .await
            .unwrap();
        (status, String::from_utf8(bytes.to_vec()).unwrap())
    }
}
