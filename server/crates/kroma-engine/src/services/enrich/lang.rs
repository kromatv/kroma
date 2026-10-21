use tracing::warn;

use crate::db::{self, Pool};

pub(super) fn stale_langs(pool: &Pool, kind: &str, id: &str, langs: &[&str]) -> Vec<String> {
    match db::translations::stale_langs(pool, kind, id, langs) {
        Ok(stale) => stale,
        // A read that failed is not an answer. Taking it for "nothing is stale"
        // marks the title complete in whatever languages it happens to hold.
        Err(e) => {
            warn!(id = %id, error = %e, "could not tell which languages are stale; assuming all");
            langs.iter().map(|l| (*l).to_string()).collect()
        }
    }
}

pub(super) fn primary_lang<T>(
    map: &std::collections::HashMap<String, T>,
    household: &str,
) -> String {
    let base = household.split(['-', '_']).next().unwrap_or("en");
    if map.contains_key(base) {
        base.to_string()
    } else if map.contains_key("en") {
        "en".to_string()
    } else {
        map.keys().next().cloned().unwrap_or_default()
    }
}
