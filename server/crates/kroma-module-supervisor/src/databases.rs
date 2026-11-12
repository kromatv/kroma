//! Where the host keeps a module's databases, `<data>/databases/<id>/`, a folder
//! no module holds, and the one move of the databases a module kept in its own
//! folder before.

mod copy;

use std::path::{Path, PathBuf};

use anyhow::Context;

use super::private_folder::private_folder;
use super::Supervisor;

const MOVING_PREFIX: &str = ".moving-";
const MAX_NAME: usize = 128;

pub(crate) fn is_database_name(name: &str) -> bool {
    let mut chars = name.chars();
    let starts_well = chars.next().is_some_and(|c| c.is_ascii_alphanumeric() || c == '_');
    starts_well
        && name.len() <= MAX_NAME
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        && !kroma_sqlite::JOURNALS.iter().any(|suffix| name.ends_with(suffix))
}

impl Supervisor {
    pub(crate) fn databases_dir(&self, id: &str) -> PathBuf {
        kroma_sqlite::module_databases_dir(&self.cfg.data_dir, id)
    }

    pub(crate) fn module_databases(&self, id: &str) -> anyhow::Result<PathBuf> {
        let dir = self.databases_dir(id);
        if !std::fs::symlink_metadata(&dir).is_ok_and(|meta| meta.is_dir()) {
            if let Err(error) = self.move_databases(id, &dir) {
                self.say(
                    id,
                    &format!(
                        "ERROR this module's databases could not be moved to where the host keeps them, and it starts once they are: {error:#}"
                    ),
                );
                return Err(error);
            }
        }
        private_folder(&dir).with_context(|| format!("create {}", dir.display()))?;
        dir.canonicalize()
            .with_context(|| format!("resolve {}", dir.display()))
    }

    fn move_databases(&self, id: &str, dir: &Path) -> anyhow::Result<()> {
        let root = dir.parent().context("the databases folder has no parent")?;
        private_folder(root).with_context(|| format!("create {}", root.display()))?;
        let moving = root.join(format!("{MOVING_PREFIX}{id}"));
        let _ = std::fs::remove_dir_all(&moving);
        let own = self.own_dir(id);
        let moved = copy::copy_databases(&own, &moving).and_then(|names| {
            std::fs::rename(&moving, dir)?;
            std::fs::File::open(root)?.sync_all()?;
            Ok(names)
        });
        let names = match moved {
            Ok(names) => names,
            Err(error) => {
                let _ = std::fs::remove_dir_all(&moving);
                return Err(error);
            }
        };
        for name in &names {
            forget(&own, name);
        }
        if !names.is_empty() {
            self.say(
                id,
                &format!(
                    "INFO moved {} database(s) out of this module's own folder, to where the host keeps them",
                    names.len()
                ),
            );
        }
        Ok(())
    }
}

fn forget(own: &Path, name: &str) {
    let database = own.join(name);
    for suffix in kroma_sqlite::JOURNALS {
        let _ = std::fs::remove_file(kroma_sqlite::journal_of(&database, suffix));
    }
    let _ = std::fs::remove_file(database);
}

#[cfg(test)]
mod tests;
