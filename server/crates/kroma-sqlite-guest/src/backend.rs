use std::sync::OnceLock;

use crate::types::Value;

/// What the host answers one statement with. Every row is here already: nothing
/// stays open on the host between two calls.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Outcome {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub changes: u64,
    pub last_insert_rowid: i64,
}

/// A statement the database refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Failure {
    pub code: i32,
    pub message: String,
}

/// The way to the host's databases. A component's runtime registers one at start.
pub trait Backend: Send + Sync {
    /// Open the database at `path` on the host. A path the module has no right to
    /// is refused here.
    fn open(&self, path: &str) -> Result<u32, Failure>;
    fn close(&self, connection: u32);
    fn run(&self, connection: u32, statement: &str, params: Vec<Value>) -> Result<Outcome, Failure>;
    fn batch(&self, connection: u32, statements: &str) -> Result<(), Failure>;
    /// Keep a copy of this connection's database at `target`, before a migration.
    fn snapshot(&self, connection: u32, target: &str) -> Result<(), Failure>;
}

static BACKEND: OnceLock<&'static dyn Backend> = OnceLock::new();

/// Connect this crate to its host. Every later call goes to `backend`, and the
/// first one registered stays.
pub fn set_backend(backend: &'static dyn Backend) {
    let _ = BACKEND.set(backend);
}

pub(crate) fn backend() -> Result<&'static dyn Backend, Failure> {
    BACKEND.get().copied().ok_or_else(|| Failure {
        code: 1,
        message: "this component has no database".to_string(),
    })
}
