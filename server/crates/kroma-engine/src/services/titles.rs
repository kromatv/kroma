//! A film or a show, named by its kind and its id, as the pages that change
//! one by hand reach it.

use anyhow::Result;

use crate::db::metadata_core::SHOW;
use crate::db::{self, Pool};
use crate::infra::events::ServerEvent;
use crate::state::SharedState;

/// Whether the `kind` title `id` is in the catalog.
pub fn exists(pool: &Pool, kind: &str, id: &str) -> Result<bool> {
    Ok(if kind == SHOW {
        db::show_title(pool, id)?.is_some()
    } else {
        db::get_item(pool, id)?.is_some()
    })
}

/// Tell every client to load the `kind` title `id` again.
pub fn announce(state: &SharedState, kind: &str, id: &str) {
    let id = id.to_string();
    state.events.publish(if kind == SHOW {
        ServerEvent::ShowUpdated { id }
    } else {
        ServerEvent::ItemUpdated { id }
    });
}
