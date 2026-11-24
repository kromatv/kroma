//! The `.nfo` file Kodi, Jellyfin and Plex keep beside a title's files, read
//! for its name, summary, year and genres (`docs/reference/nfo-files.md`).

use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

use roxmltree::{Document, Node};

use crate::model::title_edit::TitleEdit;

/// The largest `.nfo` file read, in bytes.
pub const MAX_BYTES: u64 = 1 << 20;
/// The root element of a film's `.nfo`.
pub const MOVIE: &str = "movie";
/// The root element of a show's `.nfo`.
pub const TVSHOW: &str = "tvshow";

/// The text the `.nfo` at `path` gives a title, when its root element is
/// `root`, cut to what a title holds. A file that cannot be read, is not
/// UTF-8, is larger than [`MAX_BYTES`] or is not such a document gives
/// nothing.
pub fn read(path: &Path, root: &str) -> TitleEdit {
    contents(path)
        .and_then(|text| parsed(&text, root))
        .unwrap_or_default()
}

/// When the file at `path` was last modified, in milliseconds.
pub fn modified(path: &Path) -> Option<i64> {
    let changed = std::fs::metadata(path).ok()?.modified().ok()?;
    let since = changed.duration_since(UNIX_EPOCH).ok()?;
    i64::try_from(since.as_millis()).ok()
}

fn contents(path: &Path) -> Option<String> {
    let mut bytes = Vec::new();
    let file = File::open(path).ok()?;
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes).ok()?;
    let fits = u64::try_from(bytes.len()).is_ok_and(|len| len <= MAX_BYTES);
    fits.then(|| String::from_utf8(bytes).ok()).flatten()
}

fn parsed(text: &str, root: &str) -> Option<TitleEdit> {
    let close = format!("</{root}>");
    let end = text.rfind(&close)? + close.len();
    let doc = Document::parse(text[..end].trim_start_matches('\u{feff}')).ok()?;
    let el = doc.root_element();
    if !el.has_tag_name(root) {
        return None;
    }
    let edit = TitleEdit {
        title: texts(el, "title").next(),
        overview: texts(el, "plot").next(),
        year: year_of(el),
        genres: Some(texts(el, "genre").collect()),
    };
    Some(edit.clipped())
}

fn year_of(el: Node<'_, '_>) -> Option<u32> {
    let premiered = texts(el, "premiered").find_map(|date| date.trim().get(..4)?.parse().ok());
    premiered.or_else(|| texts(el, "year").find_map(|year| year.trim().parse().ok()))
}

fn texts<'a>(el: Node<'a, 'a>, name: &'a str) -> impl Iterator<Item = String> + 'a {
    el.children()
        .filter(move |child| child.has_tag_name(name))
        .filter_map(|child| child.text())
        .map(str::to_string)
}

#[cfg(test)]
mod tests;
