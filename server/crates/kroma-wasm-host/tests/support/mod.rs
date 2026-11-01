#![allow(dead_code)]

use std::path::Path;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use kroma_wasm_host::{
    FetchCall, Grant, Limits, ModuleComponent, ModuleInstance, NetPolicy, Request, Response,
    Settings, Verdict, WasmHost,
};

pub const MEMORY_CEILING_BYTES: usize = 32 * 1024 * 1024;
pub const CPU_BUDGET: Duration = Duration::from_millis(200);
pub const LIMITS: Limits = Limits {
    memory_bytes: MEMORY_CEILING_BYTES,
    cpu_budget: CPU_BUDGET,
};

#[cfg(unix)]
pub const HOST_ABSOLUTE_FILE: &str = "/etc/passwd";
#[cfg(windows)]
pub const HOST_ABSOLUTE_FILE: &str = r"C:\Windows\System32\drivers\etc\hosts";
pub const HOST_RELATIVE_FILE: &str = "Cargo.toml";

const GUEST_TARGET: &str = "wasm32-wasip2";

pub struct BlockEverything;

impl NetPolicy for BlockEverything {
    fn decide(&self, call: &FetchCall) -> Verdict {
        Verdict::Block(format!("{} is not declared", call.purpose))
    }
}

pub fn component() -> &'static ModuleComponent {
    static COMPONENT: OnceLock<ModuleComponent> = OnceLock::new();
    COMPONENT.get_or_init(|| {
        let host = WasmHost::new().expect("build the wasm host");
        host.compile(&build_guest())
            .expect("compile the test guest")
    })
}

pub fn instance(policy: Arc<dyn NetPolicy>, settings: Settings, limits: Limits) -> ModuleInstance {
    let grant = Grant {
        policy,
        settings,
        limits,
    };
    component()
        .instantiate(grant)
        .expect("instantiate the test guest")
}

pub fn sandboxed() -> ModuleInstance {
    instance(Arc::new(BlockEverything), Settings::default(), LIMITS)
}

pub fn request(path: &str, argument: &str) -> Request {
    Request {
        method: "POST".into(),
        path: path.into(),
        body: argument.as_bytes().to_vec(),
    }
}

pub fn probe(instance: &mut ModuleInstance, path: &str, argument: &str) -> Response {
    instance
        .handle(&request(path, argument))
        .expect("the probe route answers")
}

pub fn text(response: &Response) -> String {
    String::from_utf8_lossy(&response.body).into_owned()
}

fn build_guest() -> Vec<u8> {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/guest/Cargo.toml");
    let target_dir = Path::new(env!("CARGO_TARGET_TMPDIR")).join("wasm-guest");
    let output = kroma_testing::cargo()
        .args(["build", "--release", "--locked", "--target", GUEST_TARGET])
        .arg("--manifest-path")
        .arg(&manifest)
        .arg("--target-dir")
        .arg(&target_dir)
        .output()
        .expect("run cargo to build the test guest");
    assert!(
        output.status.success(),
        "building the test guest failed; is the target installed (`rustup target add {GUEST_TARGET}`)?\n{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let wasm = target_dir.join(format!("{GUEST_TARGET}/release/kroma_wasm_host_guest.wasm"));
    std::fs::read(&wasm).expect("read the built test guest")
}
