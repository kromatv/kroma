mod household;
mod recorded;

use kroma_module_sdk::db::apply_migrations;
use kroma_module_sdk::db::testing::{temp_pool, TempPool};
use kroma_module_sdk::primitives::random_token;

use crate::store::MIGRATIONS;

pub(crate) use household::{Household, ACCOUNT, LOCAL, LOCAL_PLAIN, MACHINE, OWNER, RELAY, REMOTE};
pub(crate) use recorded::{get, post, Seen, When};

pub(crate) fn store() -> TempPool {
    let pool = temp_pool("plex-import");
    apply_migrations(&pool.get().unwrap(), MIGRATIONS).unwrap();
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
