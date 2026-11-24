//! Overlaying a locale onto the sign-in splash.

use kroma_domain::SplashEntry;

use super::layer::Ask;
use crate::{metadata_core, Connection, Result};

/// Overlay `locale` onto splash entries, each beside the id of the title it
/// shows: the name and year a person or an `.nfo` file wrote, else the name
/// fetched in `locale`, and the backdrop and poster kept for the title.
pub fn overlay_splash(
    conn: &Connection,
    entries: &mut [(String, SplashEntry)],
    locale: &str,
) -> Result<()> {
    let ask = Ask { conn, locale };
    for (subject, kind) in [
        (metadata_core::ITEM, "movie"),
        (metadata_core::SHOW, "show"),
    ] {
        let ids: Vec<&str> = entries
            .iter()
            .filter(|(_, e)| e.kind == kind)
            .map(|(id, _)| id.as_str())
            .collect();
        let layer = ask.layer(subject, &ids)?;
        for (id, entry) in entries.iter_mut().filter(|(_, e)| e.kind == kind) {
            layer.on_splash(id, entry);
        }
    }
    Ok(())
}
