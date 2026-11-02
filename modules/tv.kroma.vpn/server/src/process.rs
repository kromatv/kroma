use std::path::Path;

use kroma_module_sdk::host::process::{Child, Command};

pub(crate) fn spawn_child(program: &str, conf: &Path) -> Result<Child, String> {
    Command::new(program)
        .arg("-c")
        .arg(conf.to_string_lossy())
        .spawn()
        .map_err(|e| format!("spawn wireproxy: {e}"))
}
