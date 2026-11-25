//! The poster, the backdrop and the logo an admin chooses for a title
//! (MEDIA-50, MEDIA-54), uploaded or linked to (MEDIA-57). They come before the
//! pictures kept beside its files and before fetched art, and a refresh of its
//! metadata leaves them where they are (LIB-44).

use anyhow::Result;

use crate::db;
use crate::db::art_chosen::Slot;
use crate::infra::image::{fetch_link, store_upload};
use crate::services::art_beside::max_width;
use crate::services::titles::{announce, exists};
use crate::state::SharedState;

const CHOSEN_PREFIX: &str = "chosen-";

/// What choosing a picture for a title did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Choice {
    /// The title shows the picture now, served under this URL.
    Shown(String),
    /// The bytes are not a picture KROMA can read.
    Unreadable,
    /// The link serves nothing KROMA may fetch.
    Unreachable,
    /// No title has that id.
    NoSuchTitle,
}

/// Show the picture in `bytes` in `slot`, in place of any chosen before.
pub fn choose(state: &SharedState, slot: Slot<'_>, bytes: &[u8]) -> Result<Choice> {
    if !exists(&state.db, slot.kind, slot.id)? {
        return Ok(Choice::NoSuchTitle);
    }
    keep(state, slot, bytes)
}

/// Show the picture at `link`, an `http` or `https` URL on the public internet,
/// in `slot`, in place of any chosen before. It is fetched once and kept as an
/// upload is.
pub fn choose_link(state: &SharedState, slot: Slot<'_>, link: &str) -> Result<Choice> {
    if !exists(&state.db, slot.kind, slot.id)? {
        return Ok(Choice::NoSuchTitle);
    }
    match fetch_link(link) {
        Some(bytes) => keep(state, slot, &bytes),
        None => Ok(Choice::Unreachable),
    }
}

fn keep(state: &SharedState, slot: Slot<'_>, bytes: &[u8]) -> Result<Choice> {
    let width = Some(max_width(slot.role));
    let Some(url) = store_upload(&state.config.data_dir, bytes, width, CHOSEN_PREFIX) else {
        return Ok(Choice::Unreadable);
    };
    db::art_chosen::choose(&state.db, slot, &url)?;
    announce(state, slot.kind, slot.id);
    Ok(Choice::Shown(url))
}

/// Hand `slot` back to the picture beside the title's files, or to fetched
/// art. False when no title has that id.
pub fn reset(state: &SharedState, slot: Slot<'_>) -> Result<bool> {
    if !exists(&state.db, slot.kind, slot.id)? {
        return Ok(false);
    }
    db::art_chosen::clear(&state.db, slot)?;
    announce(state, slot.kind, slot.id);
    Ok(true)
}

#[cfg(test)]
mod tests;
