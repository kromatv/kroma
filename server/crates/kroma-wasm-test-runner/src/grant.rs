use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use kroma_testing::TempDir;
use kroma_wasm_host::{Grant, Limits, LogSink, Preopen, Settings};

use crate::offline::Offline;
use crate::sql::ScratchDatabases;

const WASM32_ADDRESS_SPACE: usize = 4 * 1024 * 1024 * 1024;
const WHOLE_RUN_BUDGET: Duration = Duration::from_secs(60 * 60);
const PASSED_THROUGH: [&str; 2] = ["CARGO_", "RUST_"];
const NO_CAPTURE: &str = "RUST_TEST_NOCAPTURE";

pub(crate) struct TestWorld {
    _scratch: TempDir,
    scratch: PathBuf,
    module_root: Option<PathBuf>,
}

fn held(host: &Path, writable: bool) -> Preopen {
    Preopen {
        host: host.to_path_buf(),
        guest: host.to_string_lossy().into_owned(),
        writable,
    }
}

impl TestWorld {
    pub(crate) fn new() -> Self {
        let scratch_dir = kroma_testing::temp_dir("wasm-test");
        let scratch = scratch_dir.path().to_path_buf();
        let module_root = std::env::var_os("CARGO_MANIFEST_DIR")
            .map(PathBuf::from)
            .and_then(|crate_dir| crate_dir.parent().map(Path::to_path_buf));
        Self {
            _scratch: scratch_dir,
            scratch,
            module_root,
        }
    }

    fn env(&self) -> Vec<(String, String)> {
        let mut env: Vec<(String, String)> = std::env::vars()
            .filter(|(name, _)| PASSED_THROUGH.iter().any(|prefix| name.starts_with(prefix)))
            .collect();
        env.push((
            "TMPDIR".to_string(),
            self.scratch.to_string_lossy().into_owned(),
        ));
        if !env.iter().any(|(name, _)| name == NO_CAPTURE) {
            env.push((NO_CAPTURE.to_string(), "1".to_string()));
        }
        env
    }

    fn preopens(&self) -> Vec<Preopen> {
        let mut preopens = vec![held(&self.scratch, true)];
        if let Some(root) = &self.module_root {
            preopens.push(held(root, false));
        }
        preopens
    }

    pub(crate) fn grant(&self, log: LogSink) -> Grant {
        Grant {
            policy: Arc::new(Offline),
            settings: Settings::default(),
            limits: Limits {
                memory_bytes: WASM32_ADDRESS_SPACE,
                cpu_budget: WHOLE_RUN_BUDGET,
            },
            env: self.env(),
            log: Some(log),
            preopens: self.preopens(),
            databases: Some(Arc::new(ScratchDatabases::new(self.scratch.clone()))),
            processes: None,
            lan: None,
            files: None,
            media: None,
        }
    }
}
