use anyhow::{anyhow, bail, Result};

use crate::server::{is_key, item_type, listing, Ask, Server, Window};
use crate::wire::LibraryKind;
use crate::xml::Element;

const PAGE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, Copy)]
pub(crate) struct Shelf<'a> {
    pub library: &'a str,
    pub window: Window,
}

/// A page of a library's films or episodes. `None` for a library of a kind
/// KROMA does not play.
pub(crate) fn titles(server: &Server<'_>, shelf: Shelf<'_>) -> Result<Option<Element>> {
    let kind = kind_of(server, shelf.library)?;
    page(server, shelf, kind, vec![("includeGuids", "1".to_string())])
}

/// The same page as `reader` sees it, which is what that user watched. The
/// library itself is looked up as `owner`, who sees every library.
pub(crate) fn states(
    owner: &Server<'_>,
    reader: &Server<'_>,
    shelf: Shelf<'_>,
) -> Result<Option<Element>> {
    let kind = kind_of(owner, shelf.library)?;
    page(reader, shelf, kind, Vec::new())
}

fn kind_of(server: &Server<'_>, library: &str) -> Result<LibraryKind> {
    if !is_key(library) {
        bail!("{library:?} is not a library of a Plex server");
    }
    server
        .sections()?
        .into_iter()
        .find(|section| section.key == library)
        .map(|section| section.kind)
        .ok_or_else(|| anyhow!("the Plex server has no library {library}"))
}

fn page(
    server: &Server<'_>,
    shelf: Shelf<'_>,
    kind: LibraryKind,
    mut query: Vec<(&'static str, String)>,
) -> Result<Option<Element>> {
    let Some(item) = item_type(kind) else {
        return Ok(None);
    };
    query.push(("type", item.to_string()));
    let read = server.read(&Ask {
        path: &listing(shelf.library),
        query,
        window: Some(shelf.window),
        max_bytes: PAGE_BYTES,
    })?;
    Ok(Some(read))
}

pub(crate) fn playable(item: &Element) -> Option<(String, Playable)> {
    let kind = match item.attr("type") {
        Some("movie") => Playable::Movie,
        Some("episode") => Playable::Episode,
        _ => return None,
    };
    let key = item.text("ratingKey").filter(|key| is_key(key))?;
    Some((key, kind))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Playable {
    Movie,
    Episode,
}
