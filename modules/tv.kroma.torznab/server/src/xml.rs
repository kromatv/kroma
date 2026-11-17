//! Pull-parsing of Torznab XML with quick-xml: the RSS search results (items
//! with `<torznab:attr>` extensions, CDATA titles, escaped entities) and the
//! `t=caps` capability document. Torznab error documents surface as `Err`.

use anyhow::{bail, Result};
use quick_xml::events::{BytesEnd, BytesStart, Event};
use quick_xml::{Reader, XmlVersion};

use crate::{Caps, Release, TORRENT, USENET};

/// Parse a Torznab RSS search response into releases.
pub fn parse_items(xml: &[u8]) -> Result<Vec<Release>> {
    let mut reader = Reader::from_reader(xml);
    // trim_text off so a field split across text + entity-ref + CDATA events keeps
    // its internal spacing; `apply_field` trims the accumulated value's ends.
    reader.config_mut().trim_text(false);

    let mut out: Vec<Release> = Vec::new();
    let mut current: Option<Release> = None;
    // The simple text element being read inside an item, if any.
    let mut field: Option<&'static str> = None;
    // Accumulates the current field's text across Text / GeneralRef (entity) /
    // CDATA events (quick-xml splits entities out of text as GeneralRef),
    // flushed to `apply_field` when the element closes.
    let mut text = String::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(e) => field = handle_start(&e, &mut current, &mut text),
            Event::Empty(e) => handle_empty(&e, &mut current)?,
            Event::Text(e) if field.is_some() => text.push_str(&e),
            // An entity reference inside a field (`&amp;`, `&#38;`, ...).
            Event::GeneralRef(r) if field.is_some() => text.push_str(&resolve_entity(&r)),
            Event::CData(e) if field.is_some() => {
                text.push_str(&e);
            }
            Event::End(e) => handle_end(&e, &mut current, &mut field, &mut text, &mut out),
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(out)
}

// A `<...>` open tag: start a new item, or name the simple text field the
// following text belongs to. Clears the field-text accumulator.
fn handle_start(
    e: &BytesStart,
    current: &mut Option<Release>,
    text: &mut String,
) -> Option<&'static str> {
    text.clear();
    match e.local_name().as_ref() {
        "item" => {
            *current = Some(Release::default());
            None
        }
        "title" if current.is_some() => Some("title"),
        "guid" if current.is_some() => Some("guid"),
        "link" if current.is_some() => Some("link"),
        "comments" if current.is_some() => Some("comments"),
        "size" if current.is_some() => Some("size"),
        "pubDate" if current.is_some() => Some("pubDate"),
        _ => None,
    }
}

// A self-closing `<... />` element: the torznab error doc, `<enclosure>`, or a
// `<torznab:attr>` extension.
fn handle_empty(e: &BytesStart, current: &mut Option<Release>) -> Result<()> {
    match e.local_name().as_ref() {
        "error" => read_error(e),
        "enclosure" => {
            if let Some(rel) = current.as_mut() {
                read_enclosure(e, rel)?;
            }
            Ok(())
        }
        "attr" => {
            if let Some(rel) = current.as_mut() {
                read_attr_el(e, rel)?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

// A `<error code=.. description=.. />` document: always surfaced as `Err`.
fn read_error(e: &BytesStart) -> Result<()> {
    let mut code = String::new();
    let mut description = String::new();
    for attr in e.attributes().flatten() {
        let v = attr.normalized_value(XmlVersion::Implicit1_0)?.into_owned();
        match attr.key.local_name().as_ref() {
            "code" => code = v,
            "description" => description = v,
            _ => {}
        }
    }
    bail!("torznab error {code}: {description}");
}

fn read_enclosure(e: &BytesStart, rel: &mut Release) -> Result<()> {
    for attr in e.attributes().flatten() {
        let value = attr.normalized_value(XmlVersion::Implicit1_0)?.into_owned();
        match attr.key.local_name().as_ref() {
            "url" => {
                if rel.link.is_none() {
                    rel.link = Some(value);
                }
            }
            "type" => {
                if let Some(protocol) = protocol_of(&value) {
                    rel.protocol = protocol.to_string();
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn protocol_of(mime: &str) -> Option<&'static str> {
    match mime.trim().to_ascii_lowercase().as_str() {
        "application/x-bittorrent" => Some(TORRENT),
        "application/x-nzb" => Some(USENET),
        _ => None,
    }
}

fn settle(mut rel: Release) -> Release {
    if rel.magnet.is_some() || rel.protocol.is_empty() {
        rel.protocol = TORRENT.to_string();
    }
    if rel.protocol == TORRENT {
        rel.seeders.get_or_insert(0);
    }
    rel
}

// `<torznab:attr name=.. value=.. />`: fold the extension into the release.
fn read_attr_el(e: &BytesStart, rel: &mut Release) -> Result<()> {
    let (mut name, mut value) = (String::new(), String::new());
    for attr in e.attributes().flatten() {
        let v = attr.normalized_value(XmlVersion::Implicit1_0)?.into_owned();
        match attr.key.local_name().as_ref() {
            "name" => name = v,
            "value" => value = v,
            _ => {}
        }
    }
    apply_attr(rel, &name, &value);
    Ok(())
}

// A `</...>` close tag: flush the accumulated field text, and on `</item>`
// commit the release (if it has a title).
fn handle_end(
    e: &BytesEnd,
    current: &mut Option<Release>,
    field: &mut Option<&'static str>,
    text: &mut String,
    out: &mut Vec<Release>,
) {
    // Flush the accumulated field text as the element closes.
    if let (Some(rel), Some(f)) = (current.as_mut(), field.take()) {
        apply_field(rel, f, text);
    }
    text.clear();
    if e.local_name().as_ref() == "item" {
        if let Some(rel) = current.take() {
            if !rel.title.is_empty() {
                out.push(settle(rel));
            }
        }
    }
}

// Resolve a quick-xml `GeneralRef` (the `amp` of `&amp;`, or `#38` of `&#38;`)
// to its text by rebuilding the escaped form and running the standard XML
// unescaper (predefined entities + numeric refs). Unknown refs drop to empty.
fn resolve_entity(r: &quick_xml::events::BytesRef) -> String {
    quick_xml::escape::unescape(&format!("&{};", &**r))
        .map(|c| c.into_owned())
        .unwrap_or_default()
}

fn apply_field(rel: &mut Release, field: &str, text: &str) {
    let text = text.trim();
    if text.is_empty() {
        return;
    }
    match field {
        "title" => rel.title = text.to_string(),
        "guid" => {
            rel.guid = text.to_string();
            // Many trackers set <guid> to the details page URL; keep it as a
            // fallback info link when no explicit <comments> is provided.
            if text.starts_with("http") {
                rel.details_url.get_or_insert_with(|| text.to_string());
            }
        }
        // The tracker's human torrent page; wins over the guid fallback.
        "comments" if text.starts_with("http") => rel.details_url = Some(text.to_string()),
        // <link> can be the magnet itself on some indexers.
        "link" if text.starts_with("magnet:") => {
            rel.magnet.get_or_insert_with(|| text.to_string());
        }
        "link" => {
            rel.link.get_or_insert_with(|| text.to_string());
        }
        "size" => rel.size_bytes = text.parse().ok(),
        "pubDate" => rel.published_at = Some(text.to_string()),
        _ => {}
    }
}

fn apply_attr(rel: &mut Release, name: &str, value: &str) {
    match name {
        "seeders" => rel.seeders = value.parse().ok(),
        // Torznab "peers" is seeders + leechers.
        "peers" => {
            if let Ok(peers) = value.parse::<u32>() {
                rel.leechers = Some(peers.saturating_sub(rel.seeders.unwrap_or(0)));
            }
        }
        "infohash" => rel.info_hash = Some(value.to_string()),
        "magneturl" => rel.magnet = Some(value.to_string()),
        "imdbid" | "imdb" => rel.imdb_id = Some(value.to_string()),
        "grabs" => rel.grabs = value.parse().ok(),
        "tmdbid" => rel.tmdb_id = value.parse().ok(),
        "size" => rel.size_bytes = rel.size_bytes.or_else(|| value.parse().ok()),
        "downloadvolumefactor" => rel.download_volume_factor = value.parse().ok(),
        "uploadvolumefactor" => rel.upload_volume_factor = value.parse().ok(),
        _ => {}
    }
}

/// Parse a `t=caps` document into the supported-parameter flags.
pub fn parse_caps(xml: &[u8]) -> Result<Caps> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut caps = Caps::default();
    let mut buf = Vec::new();

    loop {
        let event = reader.read_event_into(&mut buf)?;
        match &event {
            Event::Start(e) | Event::Empty(e) => {
                let name = e.local_name().as_ref().to_string();
                let mut supported = String::new();
                for attr in e.attributes().flatten() {
                    let v = attr.normalized_value(XmlVersion::Implicit1_0)?.into_owned();
                    match attr.key.local_name().as_ref() {
                        "supportedParams" => supported = v,
                        "title" if name == "server" => caps.server_title = Some(v),
                        "code" if name == "error" => {
                            bail!("torznab error {v}");
                        }
                        _ => {}
                    }
                }
                let has = |p: &str| supported.split(',').any(|s| s.trim() == p);
                match name.as_str() {
                    "movie-search" => {
                        caps.search_tmdb = has("tmdbid");
                        caps.search_imdb = has("imdbid");
                    }
                    "tv-search" => {
                        caps.tv_search_tmdb = has("tmdbid");
                        caps.tv_search_season = has("season");
                    }
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(caps)
}

#[cfg(test)]
mod tests;
