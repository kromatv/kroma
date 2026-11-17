//! Auditing one module on its own: it is started alone, behind a network that
//! records every connection and lets none out and a host that holds nothing,
//! then driven, and what it attempted is set beside what its manifest declares.

#![cfg(unix)]

mod drive;
mod host;
mod recorder;
mod report;

use std::path::Path;
use std::sync::Arc;

use anyhow::Context;
use kroma_module_host::testing::StubHost;
use kroma_module_host::NetworkPolicyOf;
use kroma_module_manifest::ModuleManifest;
use kroma_module_supervisor::{FolderRoots, Supervisor, SupervisorConfig, INSTALLED_DIR, MODULE_COMPONENT};
use serde_json::json;
use sha2::{Digest, Sha256};

pub use drive::{Ask, Call, Fixtures};
pub use recorder::{Connection, Recorder};
pub use report::{File, Program, Report};

/// The file beside `module.json` that says what else an audit should ask of the
/// module.
pub const FIXTURES_FILE: &str = "audit.json";

const OFFICIAL_PREFIX: &str = "tv.kroma.";

fn fixtures_in(module_dir: &Path) -> anyhow::Result<Fixtures> {
    let path = module_dir.join(FIXTURES_FILE);
    if !path.exists() {
        return Ok(Fixtures::default());
    }
    serde_json::from_str(&std::fs::read_to_string(&path)?)
        .with_context(|| format!("{} is not a valid audit file", path.display()))
}

fn install(data_dir: &Path, manifest: &ModuleManifest, authored: &str, component: &[u8]) -> anyhow::Result<()> {
    let installed = data_dir.join(INSTALLED_DIR).join(&manifest.id);
    std::fs::create_dir_all(&installed)?;
    std::fs::write(installed.join("module.json"), authored)?;
    std::fs::write(installed.join(MODULE_COMPONENT), component)?;
    let origin = json!({
        "kind": "upload",
        "installedAt": 0,
        "official": manifest.id.starts_with(OFFICIAL_PREFIX),
        "componentSha256": hex::encode(Sha256::digest(component)),
    });
    std::fs::write(installed.join("origin.json"), origin.to_string())?;
    Ok(())
}

fn methods_of(module_dir: &Path, own: &ModuleManifest, point: &str) -> Vec<String> {
    let Some((definer, local)) = point.rsplit_once('/') else {
        return Vec::new();
    };
    let defined = |manifest: &ModuleManifest| {
        manifest
            .defines_points
            .iter()
            .find(|defined| defined.name == local)
            .map(|defined| defined.methods.clone())
            .unwrap_or_default()
    };
    if definer == own.id {
        return defined(own);
    }
    module_dir
        .parent()
        .map(|beside| beside.join(definer).join("module.json"))
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<ModuleManifest>(&text).ok())
        .map(|manifest| defined(&manifest))
        .unwrap_or_default()
}

/// Audits the module in `module_dir`, whose built component is at `component`.
/// It reads `module.json` there, and [`FIXTURES_FILE`] when the module has one.
/// Nothing the module does leaves this machine.
pub fn audit(module_dir: &Path, component: &Path) -> anyhow::Result<Report> {
    let authored = std::fs::read_to_string(module_dir.join("module.json"))
        .with_context(|| format!("{} holds no module.json", module_dir.display()))?;
    let manifest: ModuleManifest = serde_json::from_str(&authored).context("module.json is not a manifest")?;
    let fixtures = fixtures_in(module_dir)?;
    let wasm = std::fs::read(component).with_context(|| format!("read {}", component.display()))?;

    let scratch = kroma_testing::temp_dir("audit");
    let data_dir = scratch.path().to_path_buf();
    install(&data_dir, &manifest, &authored, &wasm)?;

    let recorder = Arc::new(Recorder::new(manifest.permissions.clone(), fixtures.settings.clone()));
    let runtime = tokio::runtime::Runtime::new()?;
    let supervisor = Supervisor::new(SupervisorConfig {
        modules_dir: data_dir.join("modules"),
        core_port: 0,
        host_token: "audit".into(),
        db_path: data_dir.join("kroma.db"),
        data_dir: data_dir.clone(),
        reserved_ids: Vec::new(),
        server_version: "0.0.0".into(),
        core_schema: Default::default(),
        log_line: None,
    });
    let hearing = recorder.clone();
    supervisor.watch(Arc::new(move |_, asked| hearing.heard(asked)));
    supervisor.serve_gateways(
        NetworkPolicyOf(recorder.clone()),
        runtime.handle().clone(),
        FolderRoots::none(),
    );
    let stub = fixtures
        .settings
        .iter()
        .fold(StubHost::new(), |host, (key, value)| host.with_setting(key, value.clone()));
    host::serve(&supervisor, NetworkPolicyOf(recorder.clone()), stub, runtime.handle())?;

    let endpoint = supervisor
        .spawn(&manifest.id)
        .with_context(|| format!("start '{}'", manifest.id))?;
    let calls = drive::Driver {
        endpoint: &endpoint,
        token: supervisor.port_token(&manifest.id),
    }
    .run(&manifest, &fixtures, &|point| methods_of(module_dir, &manifest, point));
    supervisor.stop_all();

    let (programs, files) = Report::of_asked(recorder.asked());
    Ok(Report {
        id: manifest.id.clone(),
        version: manifest.version.to_string(),
        declared: manifest.permissions.clone(),
        connections: recorder.connections(),
        programs,
        files,
        calls,
    })
}
