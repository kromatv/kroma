//! The SQL a component runs: its own file, and the slice of the core database its
//! manifest declares. Both are held here, so a grant is the host's to enforce and
//! the component never opens either file.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock, PoisonError};

use kroma_module_wire::Migrations;
use kroma_sqlite::{Grant, Migrated, Pool, SqlStep};
use kroma_wasm_host::{Databases, SqlConnection, SqlFailure};

mod connection;

use connection::HostConnection;

const OWN_FILE: &str = "module.sqlite";
const SQLITE_ERROR: i32 = 1;
const SQLITE_AUTH: i32 = 23;

pub(super) struct ModuleDatabases {
    module: String,
    core_file: PathBuf,
    core_name: &'static str,
    own_dir: PathBuf,
    grant: Grant,
    core: OnceLock<Pool>,
    own: Mutex<HashMap<PathBuf, Pool>>,
}

fn failure(code: i32, message: impl Into<String>) -> SqlFailure {
    SqlFailure {
        code,
        message: message.into(),
    }
}

fn failure_of_any(error: &anyhow::Error) -> SqlFailure {
    failure(SQLITE_ERROR, format!("{error:#}"))
}

impl ModuleDatabases {
    pub(super) fn new(
        module: &str,
        core_file: PathBuf,
        core_name: &'static str,
        own_dir: PathBuf,
        grant: Grant,
    ) -> Self {
        Self {
            module: module.to_string(),
            core_file,
            core_name,
            own_dir,
            grant,
            core: OnceLock::new(),
            own: Mutex::new(HashMap::new()),
        }
    }

    fn core_pool(&self) -> Result<&Pool, SqlFailure> {
        if let Some(pool) = self.core.get() {
            return Ok(pool);
        }
        let pool = kroma_sqlite::init_scoped(&self.core_file, &self.module, &self.grant)
            .map_err(|error| failure_of_any(&error))?;
        Ok(self.core.get_or_init(|| pool))
    }

    fn own_pool(&self, path: &Path) -> Result<Pool, SqlFailure> {
        let mut own = self.own.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(pool) = own.get(path) {
            return Ok(pool.clone());
        }
        let pool = kroma_sqlite::open_guarded(path, &self.module).map_err(|error| failure_of_any(&error))?;
        own.insert(path.to_path_buf(), pool.clone());
        Ok(pool)
    }

    pub(super) fn migrate_own(&self, migrations: &Migrations) -> anyhow::Result<Migrated> {
        let pool = self
            .own_pool(&self.own_dir.join(OWN_FILE))
            .map_err(|failure| anyhow::anyhow!(failure.message))?;
        let steps: Vec<SqlStep> = migrations
            .steps
            .iter()
            .map(|step| SqlStep {
                name: &step.name,
                sql: &step.sql,
                rebuilds: step.rebuilds,
            })
            .collect();
        kroma_sqlite::migrate_store_sql(&pool, &self.module, &migrations.baseline, &steps)
    }

    fn is_own(&self, path: &Path) -> bool {
        path.starts_with(&self.own_dir) && !path.components().any(|part| part == Component::ParentDir)
    }
}

impl Databases for ModuleDatabases {
    fn open(&self, path: &str) -> Result<Box<dyn SqlConnection>, SqlFailure> {
        let (pool, own_dir) = if path == self.core_name {
            (self.core_pool()?.clone(), None)
        } else {
            let file = Path::new(path);
            if !self.is_own(file) {
                return Err(failure(SQLITE_AUTH, format!("{path} is not this module's database")));
            }
            (self.own_pool(file)?, Some(self.own_dir.clone()))
        };
        let connection = pool.get().map_err(|error| failure_of_any(&error))?;
        Ok(Box::new(HostConnection {
            connection,
            own_dir,
        }))
    }
}

#[cfg(test)]
mod tests;
