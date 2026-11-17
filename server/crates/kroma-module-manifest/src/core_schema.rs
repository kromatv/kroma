//! The core database's history as one build carries it, and what it says about
//! a module's `engines.core`.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::{EngineRefusal, Storage};

/// The core schema one build carries: the version it is at and, per table, the
/// versions that last changed it. Read from the `table_versions.json` the core's
/// own tests derive from its steps.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoreSchema {
    pub version: u32,
    pub tables: BTreeMap<String, TableVersions>,
}

/// When a core table last changed, and when it last changed in a way a module
/// built before reads wrongly: a column dropped or altered, a constraint
/// removed, data rewritten. Adding a column or an index changes a table without
/// breaking it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TableVersions {
    pub changed: u32,
    pub broke: u32,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub dropped: bool,
}

impl CoreSchema {
    /// Whether a module runs on this schema, given `needs`, its `engines.core`
    /// (the oldest core schema it runs on), and the tables its `storage` grant
    /// reaches. It does not when this schema is older than `needs`, or when this
    /// schema broke a table the module reaches after `needs`, which is after the
    /// module was built.
    pub fn runs(&self, needs: &str, storage: Option<&Storage>) -> Result<(), EngineRefusal> {
        let built = match needs.trim().parse::<u32>() {
            Ok(built) if built <= self.version => built,
            _ => {
                return Err(EngineRefusal::CoreSchema {
                    needs: needs.trim().to_owned(),
                    has: self.version,
                })
            }
        };
        for table in granted_tables(storage) {
            let Some(versions) = self.tables.get(&table) else {
                continue;
            };
            if versions.broke > built {
                return Err(EngineRefusal::CoreTable {
                    table,
                    built,
                    changed: versions.broke,
                });
            }
        }
        Ok(())
    }
}

fn granted_tables(storage: Option<&Storage>) -> BTreeSet<String> {
    let Some(scope) = storage.map(|s| &s.core) else {
        return BTreeSet::new();
    };
    scope
        .read
        .iter()
        .chain(&scope.write)
        .filter_map(|entry| entry.split('.').next())
        .map(|table| table.trim().to_ascii_lowercase())
        .filter(|table| !table.is_empty())
        .collect()
}

#[cfg(test)]
mod tests;
