//! The `.nfo` file Kodi, Jellyfin and Plex keep beside a title's files, read
//! for its name, summary, release date, year and genres, and the TMDB id it
//! names (`docs/reference/nfo-files.md`).

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

/// What a `.nfo` file gives its title: its text, cut to what a title holds,
/// and the TMDB id it names.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Contents {
    pub edit: TitleEdit,
    pub tmdb: Option<u64>,
}

/// What the `.nfo` at `path` gives a title, when its root element is `root`.
/// A file that cannot be read, is not UTF-8 or is larger than [`MAX_BYTES`]
/// gives nothing, and so does one that is neither such a document nor a link
/// to the title's TMDB page.
pub fn read(path: &Path, root: &str) -> Contents {
    text_in(path)
        .map(|text| parsed(&text, root))
        .unwrap_or_default()
}

/// When the file at `path` was last modified, in milliseconds.
pub fn modified(path: &Path) -> Option<i64> {
    let changed = std::fs::metadata(path).ok()?.modified().ok()?;
    let since = changed.duration_since(UNIX_EPOCH).ok()?;
    i64::try_from(since.as_millis()).ok()
}

fn text_in(path: &Path) -> Option<String> {
    let mut bytes = Vec::new();
    let file = File::open(path).ok()?;
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes).ok()?;
    let fits = u64::try_from(bytes.len()).is_ok_and(|len| len <= MAX_BYTES);
    fits.then(|| String::from_utf8(bytes).ok()).flatten()
}

fn parsed(text: &str, root: &str) -> Contents {
    let close = format!("</{root}>");
    let end = text.rfind(&close).map_or(0, |at| at + close.len());
    let (document, link) = text.split_at(end);
    let mut contents = described(document, root).unwrap_or_default();
    contents.tmdb = contents.tmdb.or_else(|| linked(link, root));
    contents
}

fn described(document: &str, root: &str) -> Option<Contents> {
    let doc = Document::parse(document.trim_start_matches('\u{feff}')).ok()?;
    let el = doc.root_element();
    if !el.has_tag_name(root) {
        return None;
    }
    let edit = TitleEdit {
        title: texts(el, "title").next(),
        overview: texts(el, "plot").next(),
        year: year_of(el),
        released: texts(el, "premiered").next(),
        genres: Some(texts(el, "genre").collect()),
    };
    Some(Contents {
        edit: edit.clipped(),
        tmdb: tmdb_of(el),
    })
}

fn tmdb_of(el: Node<'_, '_>) -> Option<u64> {
    let unique = el
        .children()
        .filter(|child| child.has_tag_name("uniqueid"))
        .filter(|child| {
            child
                .attribute("type")
                .is_some_and(|t| t.eq_ignore_ascii_case("tmdb"))
        })
        .find_map(|child| child.text().and_then(id_in));
    unique.or_else(|| texts(el, "tmdbid").find_map(|id| id_in(&id)))
}

fn linked(link: &str, root: &str) -> Option<u64> {
    let page = if root == TVSHOW {
        "themoviedb.org/tv/"
    } else {
        "themoviedb.org/movie/"
    };
    let (_, after) = link.split_once(page)?;
    let digits = after.split(|c: char| !c.is_ascii_digit()).next()?;
    id_in(digits)
}

fn id_in(text: &str) -> Option<u64> {
    text.trim().parse().ok().filter(|&id| id > 0)
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
