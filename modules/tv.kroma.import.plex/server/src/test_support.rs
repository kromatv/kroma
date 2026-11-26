mod household;
mod recorded;

use kroma_module_sdk::db::migrate_store;
use kroma_module_sdk::db::testing::{temp_pool, TempPool};
use kroma_module_sdk::primitives::random_token;

use crate::store::{MIGRATIONS, STEPS};
use crate::MODULE_ID;

pub(crate) use household::{Household, ACCOUNT, LOCAL, LOCAL_PLAIN, MACHINE, OWNER, RELAY, REMOTE};
pub(crate) use recorded::{get, post, Seen, When};

pub(crate) fn store() -> TempPool {
    let pool = temp_pool("plex-import");
    migrate_store(&pool, MODULE_ID, MIGRATIONS, STEPS).unwrap();
    pool
}

/// A credential for one test, made when the test runs: no token is written in
/// this repository.
pub(crate) fn mint(label: &str) -> String {
    format!("{label}-{}", &random_token()[..16])
}

/// A recorded answer with each `{{name}}` replaced by its value.
pub(crate) fn filled(template: &str, values: &[(&str, &str)]) -> String {
    values
        .iter()
        .fold(template.to_string(), |text, (name, value)| {
            text.replace(&format!("{{{{{name}}}}}"), value)
        })
}
