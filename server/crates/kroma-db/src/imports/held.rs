//! What an import holds for files no title has yet, given to their titles
//! together when a scan writes those files.

use rusqlite::Connection;

use super::{plays, states};
use crate::Result;

/// Gives every title a file was just written for the watch state and the
/// plays an import held for that file, and stops holding them. Returns how
/// many rows there were.
///
/// A scan calls it in the transaction that writes its files.
pub(crate) fn release(conn: &Connection) -> Result<usize> {
    Ok(states::release_held_states(conn)? + plays::release_held_plays(conn)?)
}
