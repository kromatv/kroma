use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub fn build(crate_dir: &Path, binary: &str) -> Vec<u8> {
    build_with(crate_dir, binary, "")
}

pub fn build_with(crate_dir: &Path, binary: &str, features: &str) -> Vec<u8> {
    let target_dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("components");
    let out = kroma_testing::cargo()
        .args([
            "build",
            "--release",
            "--target",
            "wasm32-wasip2",
            "--bin",
            binary,
        ])
        .args(["--features", features])
        .arg("--manifest-path")
        .arg(crate_dir.join("Cargo.toml"))
        .current_dir(crate_dir)
        .env("CARGO_TARGET_DIR", &target_dir)
        .output()
        .expect("run cargo");
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    std::fs::read(
        target_dir
            .join("wasm32-wasip2/release")
            .join(format!("{binary}.wasm")),
    )
    .expect("the component was built")
}

pub fn module_source(id: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../modules")
        .join(id)
}

pub fn guest_component() -> &'static [u8] {
    static BUILT: OnceLock<Vec<u8>> = OnceLock::new();
    BUILT.get_or_init(|| {
        build(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/component_guest"),
            "module",
        )
    })
}
