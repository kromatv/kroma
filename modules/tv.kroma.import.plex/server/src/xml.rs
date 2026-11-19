use std::str::FromStr;

use anyhow::{anyhow, bail, Result};
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};

const MAX_DEPTH: usize = 16;

/// One element of a Plex answer: its name, its attributes and the elements
/// inside it. Plex puts every value in an attribute, so text is not kept.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct Element {
    name: String,
    attrs: Vec<(String, String)>,
    children: Vec<Element>,
}

impl Element {
    /// The root element of `body`. A body that is not well-formed XML, or that
    /// nests past any depth a Plex answer has, is refused whole.
    pub(crate) fn parse(body: &[u8]) -> Result<Self> {
        let text = std::str::from_utf8(body).map_err(|_| anyhow!("the answer is not UTF-8"))?;
        let mut reader = Reader::from_str(text);
        let mut open: Vec<Element> = Vec::new();
        loop {
            match reader.read_event()? {
                Event::Start(tag) => {
                    if open.len() >= MAX_DEPTH {
                        bail!("the answer nests past {MAX_DEPTH} elements");
                    }
                    open.push(Self::opened(&tag));
                }
                Event::Empty(tag) => match open.last_mut() {
                    Some(parent) => parent.children.push(Self::opened(&tag)),
                    None => return Ok(Self::opened(&tag)),
                },
                Event::End(_) => {
                    let closed = open.pop().ok_or_else(|| anyhow!("an unopened element"))?;
                    match open.last_mut() {
                        Some(parent) => parent.children.push(closed),
                        None => return Ok(closed),
                    }
                }
                Event::Eof => bail!("the answer holds no complete element"),
                _ => {}
            }
        }
    }

    fn opened(tag: &BytesStart<'_>) -> Self {
        let attrs = tag
            .attributes()
            .flatten()
            .filter_map(|attr| {
                let value = attr.normalized_value(XmlVersion::Implicit1_0).ok()?;
                let name: &str = attr.key.as_ref();
                Some((name.to_owned(), value.into_owned()))
            })
            .collect();
        Self {
            name: tag.name().as_ref().to_owned(),
            attrs,
            children: Vec::new(),
        }
    }

    /// An attribute's value. One that is absent or empty is `None`: Plex writes
    /// both for a value it does not have.
    pub(crate) fn attr(&self, name: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(key, value)| key == name && !value.is_empty())
            .map(|(_, value)| value.as_str())
    }

    pub(crate) fn text(&self, name: &str) -> Option<String> {
        self.attr(name).map(str::to_string)
    }

    pub(crate) fn number<T: FromStr>(&self, name: &str) -> Option<T> {
        self.attr(name)?.parse().ok()
    }

    pub(crate) fn flag(&self, name: &str) -> bool {
        self.attr(name)
            .is_some_and(|value| value == "1" || value.eq_ignore_ascii_case("true"))
    }

    pub(crate) fn children(&self) -> &[Element] {
        &self.children
    }

    pub(crate) fn named<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Element> {
        self.children.iter().filter(move |child| child.name == name)
    }

    /// Every element called `name` below this one, at any depth, in document
    /// order.
    pub(crate) fn every<'a>(&'a self, name: &str) -> Vec<&'a Element> {
        let mut found = Vec::new();
        self.collect(name, &mut found);
        found
    }

    fn collect<'a>(&'a self, name: &str, found: &mut Vec<&'a Element>) {
        for child in &self.children {
            if child.name == name {
                found.push(child);
            }
            child.collect(name, found);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_attributes_and_nested_elements() {
        let body = br#"<?xml version="1.0"?>
            <MediaContainer size="1">
              <Video ratingKey="101" title="Heat &amp; Dust" viewCount="2">
                <Media><Part file="/data/Heat.mkv"/></Media>
              </Video>
            </MediaContainer>"#;

        let root = Element::parse(body).unwrap();

        let video = root.named("Video").next().unwrap();
        assert_eq!(root.number::<u32>("size"), Some(1));
        assert_eq!(video.attr("title"), Some("Heat & Dust"));
        assert_eq!(video.number::<u32>("viewCount"), Some(2));
        assert_eq!(root.every("Part")[0].attr("file"), Some("/data/Heat.mkv"));
    }

    #[test]
    fn reads_an_empty_attribute_as_absent() {
        let root = Element::parse(br#"<pin id="7" authToken=""/>"#).unwrap();

        assert_eq!(root.attr("authToken"), None);
        assert_eq!(root.text("id").as_deref(), Some("7"));
    }

    #[test]
    fn reads_a_flag_written_as_one_or_as_true() {
        let root = Element::parse(br#"<c a="1" b="true" c="0" d="yes"/>"#).unwrap();

        let flags = ["a", "b", "c", "d", "e"].map(|name| root.flag(name));
        assert_eq!(flags, [true, true, false, false, false]);
    }

    #[test]
    fn refuses_a_body_that_is_not_xml() {
        let cut = Element::parse(b"<MediaContainer><Video>");
        let page = Element::parse(b"Bad Gateway");

        assert!(cut.is_err());
        assert!(page.is_err());
    }

    #[test]
    fn refuses_a_body_nested_past_any_plex_answer() {
        let deep = "<a>".repeat(MAX_DEPTH + 1);

        let parsed = Element::parse(deep.as_bytes());

        assert!(parsed.is_err());
    }
}
