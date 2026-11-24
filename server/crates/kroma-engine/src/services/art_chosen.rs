//! The poster and the backdrop an admin chooses for a title (MEDIA-50). They
//! come before the pictures kept beside its files and before fetched art, and
//! a refresh of its metadata leaves them where they are (LIB-44).

use anyhow::Result;

use crate::db::art_chosen::Slot;
use crate::db::metadata_core::SHOW;
use crate::db::{self, Pool};
use crate::infra::events::ServerEvent;
use crate::infra::image::store_upload;
use crate::services::art_beside::max_width;
use crate::state::SharedState;

const CHOSEN_PREFIX: &str = "chosen-";

/// What choosing a picture for a title did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Choice {
    /// The title shows the picture now, served under this URL.
    Shown(String),
    /// The bytes are not a picture KROMA can read.
    Unreadable,
    /// No title has that id.
    NoSuchTitle,
}

/// Show the picture in `bytes` in `slot`, in place of any chosen before.
pub fn choose(state: &SharedState, slot: Slot<'_>, bytes: &[u8]) -> Result<Choice> {
    if !exists(&state.db, slot)? {
        return Ok(Choice::NoSuchTitle);
    }
    let width = Some(max_width(slot.role));
    let Some(url) = store_upload(&state.config.data_dir, bytes, width, CHOSEN_PREFIX) else {
        return Ok(Choice::Unreadable);
    };
    db::art_chosen::choose(&state.db, slot, &url)?;
    announce(state, slot);
    Ok(Choice::Shown(url))
}

/// Hand `slot` back to the picture beside the title's files, or to fetched
/// art. False when no title has that id.
pub fn reset(state: &SharedState, slot: Slot<'_>) -> Result<bool> {
    if !exists(&state.db, slot)? {
        return Ok(false);
    }
    db::art_chosen::clear(&state.db, slot)?;
    announce(state, slot);
    Ok(true)
}

fn exists(pool: &Pool, slot: Slot<'_>) -> Result<bool> {
    Ok(if slot.kind == SHOW {
        db::show_title(pool, slot.id)?.is_some()
    } else {
        db::get_item(pool, slot.id)?.is_some()
    })
}

fn announce(state: &SharedState, slot: Slot<'_>) {
    let id = slot.id.to_string();
    state.events.publish(if slot.kind == SHOW {
        ServerEvent::ShowUpdated { id }
    } else {
        ServerEvent::ItemUpdated { id }
    });
}

#[cfg(test)]
mod tests;
