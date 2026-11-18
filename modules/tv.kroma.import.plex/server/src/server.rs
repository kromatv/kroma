//! A Plex Media Server, as the importer reads it. Every call is a `GET`. Each
//! one and its source is in `docs/reference/plex-api.md`.

use crate::failure::Failure;
use crate::web::{Call, Door, Web};
use crate::wire::LibraryKind;
use crate::xml::Element;

pub(crate) const SERVER: &str = "the Plex server";

const SMALL: u64 = 1024 * 1024;
const PROBE_SECONDS: u32 = 4;
const MAX_SECONDS: u32 = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Window {
    pub start: u64,
    pub size: u64,
}

pub(crate) struct Ask<'a> {
    pub path: &'a str,
    pub query: Vec<(&'static str, String)>,
    pub window: Option<Window>,
    pub max_bytes: u64,
}

impl<'a> Ask<'a> {
    pub(crate) fn small(path: &'a str) -> Self {
        Self {
            path,
            query: Vec::new(),
            window: None,
            max_bytes: SMALL,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Section {
    pub key: String,
    pub name: String,
    pub kind: LibraryKind,
    pub folders: Vec<String>,
}

/// A server at an address that answered as it. It holds a token, so it has no
/// `Debug`.
pub(crate) struct Server<'a> {
    pub web: &'a dyn Web,
    pub base: String,
    pub token: String,
}

impl Server<'_> {
    pub(crate) fn as_user(&self, token: String) -> Server<'_> {
        Server {
            web: self.web,
            base: self.base.clone(),
            token,
        }
    }

    pub(crate) fn read(&self, ask: &Ask<'_>) -> Result<Element, Failure> {
        let mut headers = vec![
            ("Accept", "application/xml".to_string()),
            ("X-Plex-Token", self.token.clone()),
        ];
        if let Some(window) = ask.window {
            headers.push(("X-Plex-Container-Start", window.start.to_string()));
            headers.push(("X-Plex-Container-Size", window.size.to_string()));
        }
        let call = Call {
            door: Door::Server,
            url: format!("{}{}", self.base, ask.path),
            query: ask.query.clone(),
            headers,
            max_bytes: ask.max_bytes,
            max_seconds: MAX_SECONDS,
        };
        let answer = self
            .web
            .get(&call)
            .map_err(|_| Failure::Unreached(SERVER))?;
        match answer.status {
            200..=299 => Element::parse(&answer.body).map_err(|_| Failure::Unreadable(SERVER)),
            401 => Err(Failure::Denied(SERVER)),
            other => Err(Failure::Status(SERVER, other)),
        }
    }

    /// How many items a list holds, without reading one. `None` when the
    /// server answered and gave no count.
    pub(crate) fn total(&self, ask: Ask<'_>) -> Result<Option<u64>, Failure> {
        let counted = self.read(&Ask {
            window: Some(Window { start: 0, size: 0 }),
            ..ask
        });
        Ok(answered(counted)?.and_then(|list| list.number("totalSize")))
    }

    /// Whether a list holds anything. A server that answers with a refusal
    /// holds nothing there.
    pub(crate) fn any(&self, ask: Ask<'_>) -> Result<bool, Failure> {
        let first = self.read(&Ask {
            window: Some(Window { start: 0, size: 1 }),
            ..ask
        });
        Ok(answered(first)?.is_some_and(|list| !list.children().is_empty()))
    }

    pub(crate) fn sections(&self) -> Result<Vec<Section>, Failure> {
        let listed = self.read(&Ask::small("/library/sections"))?;
        Ok(listed.named("Directory").filter_map(section).collect())
    }
}

fn answered(read: Result<Element, Failure>) -> Result<Option<Element>, Failure> {
    match read {
        Ok(list) => Ok(Some(list)),
        Err(failure) if failure.is_an_answer() => Ok(None),
        Err(failure) => Err(failure),
    }
}

fn section(directory: &Element) -> Option<Section> {
    let key = directory.text("key").filter(|key| is_key(key))?;
    let kind = match directory.attr("type") {
        Some("movie") => LibraryKind::Movies,
        Some("show") => LibraryKind::Shows,
        _ => LibraryKind::Other,
    };
    Some(Section {
        name: directory.text("title").unwrap_or_else(|| key.clone()),
        kind,
        folders: directory
            .named("Location")
            .filter_map(|location| location.text("path"))
            .collect(),
        key,
    })
}

/// The `type` a library's playable titles are listed under: films for a film
/// library, episodes for a show library, and none for any other.
pub(crate) fn item_type(kind: LibraryKind) -> Option<&'static str> {
    match kind {
        LibraryKind::Movies => Some("1"),
        LibraryKind::Shows => Some("4"),
        LibraryKind::Other => None,
    }
}

pub(crate) fn listing(key: &str) -> String {
    format!("/library/sections/{key}/all")
}

pub(crate) fn is_key(key: &str) -> bool {
    !key.is_empty() && key.len() <= 20 && key.bytes().all(|byte| byte.is_ascii_digit())
}

/// The machine identifier of whatever answers at `base`, asked without a
/// token.
pub(crate) fn identity(web: &dyn Web, base: &str) -> Option<String> {
    let call = Call {
        door: Door::Server,
        url: format!("{base}/identity"),
        query: Vec::new(),
        headers: vec![("Accept", "application/xml".to_string())],
        max_bytes: SMALL,
        max_seconds: PROBE_SECONDS,
    };
    let answer = web.get(&call).ok()?;
    if !(200..300).contains(&answer.status) {
        return None;
    }
    Element::parse(&answer.body).ok()?.text("machineIdentifier")
}
