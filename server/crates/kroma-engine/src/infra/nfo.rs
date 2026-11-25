//! The `.nfo` file Kodi, Jellyfin and Plex keep beside a title's files, read
//! for its name, original title, sort title, tagline, summary, release date,
//! year and genres, and the TMDB, IMDb and TheTVDB ids it names, and the one
//! beside an episode's file, read for its name, summary and air date
//! (`docs/reference/nfo-files.md`).

use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

use roxmltree::{Document, Node};

use crate::db::imports::Elsewhere;
use crate::model::title_edit::TitleEdit;

/// The largest `.nfo` file read, in bytes.
pub const MAX_BYTES: u64 = 1 << 20;
/// The root element of a film's `.nfo`.
pub const MOVIE: &str = "movie";
/// The root element of a show's `.nfo`.
pub const TVSHOW: &str = "tvshow";
/// The root element of an episode's `.nfo`.
pub const EPISODE: &str = "episodedetails";

/// What a `.nfo` file gives its title: its text, cut to what a title holds,
/// the TMDB id it names, and its ids on IMDb and TheTVDB.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Contents {
    pub edit: TitleEdit,
    pub tmdb: Option<u64>,
    pub elsewhere: Elsewhere,
}

/// What the `.nfo` at `path` gives a title, when its root element is one of
/// `roots`, or the first of them for a file holding only a link. A file that
/// cannot be read, is not UTF-8 or is larger than [`MAX_BYTES`] gives nothing,
/// and so does one that is neither such a document nor a link to the title's
/// TMDB page.
pub fn read(path: &Path, roots: &[&str]) -> Contents {
    let Some(text) = text_in(path) else {
        return Contents::default();
    };
    let held = roots
        .iter()
        .find(|root| text.contains(&format!("</{root}>")));
    held.or(roots.first())
        .map(|root| parsed(&text, root))
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
    let at = if root == EPISODE {
        text.find(&close)
    } else {
        text.rfind(&close)
    };
    let end = at.map_or(0, |at| at + close.len());
    let (document, link) = text.split_at(end);
    let mut contents = described(document, root).unwrap_or_default();
    contents.tmdb = contents.tmdb.or_else(|| linked(link, root));
    if root != EPISODE {
        let imdb = contents.elsewhere.imdb.take();
        contents.elsewhere.imdb = imdb.or_else(|| imdb_linked(link));
    }
    contents
}

fn described(document: &str, root: &str) -> Option<Contents> {
    let doc = Document::parse(document.trim_start_matches('\u{feff}')).ok()?;
    let el = doc.root_element();
    if !el.has_tag_name(root) {
        return None;
    }
    if root == EPISODE {
        return Some(Contents {
            edit: episode_edit(el).clipped(),
            ..Contents::default()
        });
    }
    let edit = TitleEdit {
        title: texts(el, "title").next(),
        original_title: texts(el, "originaltitle").next(),
        sort_title: texts(el, "sorttitle").next(),
        tagline: texts(el, "tagline").next(),
        overview: texts(el, "plot").next(),
        year: year_of(el),
        released: texts(el, "premiered").next(),
        genres: Some(texts(el, "genre").collect()),
    };
    Some(Contents {
        edit: edit.clipped(),
        ..named_ids(el)
    })
}

fn episode_edit(el: Node<'_, '_>) -> TitleEdit {
    TitleEdit {
        title: texts(el, "title").next(),
        overview: texts(el, "plot").next(),
        released: texts(el, "aired").next(),
        ..TitleEdit::default()
    }
}

fn named_ids(el: Node<'_, '_>) -> Contents {
    Contents {
        edit: TitleEdit::default(),
        tmdb: named_id(el, "tmdb", id_in),
        elsewhere: Elsewhere {
            imdb: named_id(el, "imdb", imdb_in),
            tvdb: named_id(el, "tvdb", id_in),
        },
    }
}

fn named_id<T>(el: Node<'_, '_>, catalogue: &str, parse: fn(&str) -> Option<T>) -> Option<T> {
    let own_tag = format!("{catalogue}id");
    let unique = el.children().filter(|child| {
        child.has_tag_name("uniqueid")
            && child
                .attribute("type")
                .is_some_and(|t| t.eq_ignore_ascii_case(catalogue))
    });
    let own = el
        .children()
        .filter(|child| child.has_tag_name(own_tag.as_str()));
    unique
        .chain(own)
        .filter_map(|child| child.text())
        .find_map(parse)
}

fn linked(link: &str, root: &str) -> Option<u64> {
    let page = match root {
        TVSHOW => "themoviedb.org/tv/",
        MOVIE => "themoviedb.org/movie/",
        _ => return None,
    };
    let (_, after) = link.split_once(page)?;
    let digits = after.split(|c: char| !c.is_ascii_digit()).next()?;
    id_in(digits)
}

fn imdb_linked(link: &str) -> Option<String> {
    let (_, after) = link.split_once("imdb.com/title/")?;
    let id = after.split(|c: char| !c.is_ascii_alphanumeric()).next()?;
    imdb_in(id)
}

fn id_in(text: &str) -> Option<u64> {
    text.trim().parse().ok().filter(|&id| id > 0)
}

fn imdb_in(text: &str) -> Option<String> {
    let id = text.trim();
    let digits = id.strip_prefix("tt")?;
    let held = digits.len() >= 7 && digits.bytes().all(|byte| byte.is_ascii_digit());
    held.then(|| id.to_string())
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
