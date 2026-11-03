//! The SQL a component runs: its own databases, and the slice of the core
//! database its manifest declares. Both are held here, so a grant is the host's
//! to enforce and the component never opens either file. A module names its own
//! database, and the host keeps it in a folder no module holds.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, PoisonError};

use kroma_module_wire::Migrations;
use kroma_sqlite::{Grant, Migrated, Pool, SqlStep};
use kroma_wasm_host::{Databases, SqlConnection, SqlFailure};

mod connection;

use connection::HostConnection;

use crate::databases::is_database_name;

const OWN_FILE: &str = "module.sqlite";
const SQLITE_ERROR: i32 = 1;
const SQLITE_AUTH: i32 = 23;

pub(super) struct ModuleDatabases {
    module: String,
    core_file: PathBuf,
    core_name: &'static str,
    kept: Arc<Kept>,
    grant: Grant,
    core: OnceLock<Pool>,
    own: Mutex<HashMap<String, Pool>>,
}

pub(super) struct Kept {
    named_under: PathBuf,
    dir: PathBuf,
}

impl Kept {
    fn name_of<'a>(&self, asked: &'a str) -> Option<&'a str> {
        let name = match Path::new(asked).strip_prefix(&self.named_under) {
            Ok(rest) => rest.to_str()?,
            Err(_) => asked,
        };
        is_database_name(name).then_some(name)
    }

    fn path_of(&self, asked: &str) -> Option<PathBuf> {
        self.name_of(asked).map(|name| self.dir.join(name))
    }
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
        named_under: PathBuf,
        kept_in: PathBuf,
        grant: Grant,
    ) -> Self {
        Self {
            module: module.to_string(),
            core_file,
            core_name,
            kept: Arc::new(Kept {
                named_under,
                dir: kept_in,
            }),
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

    fn own_pool(&self, name: &str) -> Result<Pool, SqlFailure> {
        let mut own = self.own.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(pool) = own.get(name) {
            return Ok(pool.clone());
        }
        let pool = kroma_sqlite::open_guarded(&self.kept.dir.join(name), &self.module)
            .map_err(|error| failure_of_any(&error))?;
        own.insert(name.to_string(), pool.clone());
        Ok(pool)
    }

    pub(super) fn migrate_own(&self, migrations: &Migrations) -> anyhow::Result<Migrated> {
        let pool = self
            .own_pool(OWN_FILE)
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
}

impl Databases for ModuleDatabases {
    fn open(&self, path: &str) -> Result<Box<dyn SqlConnection>, SqlFailure> {
        let (pool, kept) = if path == self.core_name {
            (self.core_pool()?.clone(), None)
        } else {
            let name = self.kept.name_of(path).ok_or_else(|| {
                failure(SQLITE_AUTH, format!("{path} is not one of this module's databases"))
            })?;
            (self.own_pool(name)?, Some(self.kept.clone()))
        };
        let connection = pool.get().map_err(|error| failure_of_any(&error))?;
        Ok(Box::new(HostConnection { connection, kept }))
    }
}

#[cfg(test)]
mod tests;
