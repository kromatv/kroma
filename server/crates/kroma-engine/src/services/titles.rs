//! A film, a show or a show's season, named by its kind and its id, as the
//! pages that change one by hand reach it.

use anyhow::Result;

use crate::db::art_beside::{season_of, SEASON};
use crate::db::metadata_core::SHOW;
use crate::db::{self, Pool};
use crate::infra::events::ServerEvent;
use crate::state::SharedState;

/// Whether the `kind` title `id` is in the catalog. A season is when one of
/// its episodes is on disk.
pub fn exists(pool: &Pool, kind: &str, id: &str) -> Result<bool> {
    Ok(match kind {
        SHOW => db::show_title(pool, id)?.is_some(),
        SEASON => db::season_on_disk(pool, id)?,
        _ => db::get_item(pool, id)?.is_some(),
    })
}

/// Tell every client to load the `kind` title `id` again: its show, for a
/// season.
pub fn announce(state: &SharedState, kind: &str, id: &str) {
    let show = |id: &str| ServerEvent::ShowUpdated { id: id.to_string() };
    state.events.publish(match kind {
        SHOW => show(id),
        SEASON => show(season_of(id).map_or(id, |(of, _)| of)),
        _ => ServerEvent::ItemUpdated { id: id.to_string() },
    });
}
