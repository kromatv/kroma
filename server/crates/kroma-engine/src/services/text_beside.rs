//! The text of the `.nfo` files a scan found beside each title's files
//! (LIB-84), and the TMDB id each names (LIB-85), read again only once a file
//! changes.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::db::Pool;
use crate::db::metadata_core::SHOW;
use crate::db::text_beside::{self, Nfo, Read, Text};
use crate::infra::nfo::{self, Contents};

/// Keep what each of `found` gives its title, reading again only the files modified
/// since an earlier scan read them. The libraries of `kept`, whose folders the
/// scan could not all read, keep what they held as well. Returns how many
/// texts were written.
pub fn keep(pool: &Pool, found: &[Nfo], kept: &HashSet<String>) -> anyhow::Result<usize> {
    let before = text_beside::read_before(pool)?;
    let texts: Vec<Text> = found
        .iter()
        .map(|nfo| {
            let Contents { edit, tmdb } = contents_of(nfo, &before);
            Text {
                nfo: nfo.clone(),
                edit,
                tmdb,
            }
        })
        .collect();
    text_beside::replace(pool, &texts, kept)
}

fn contents_of(found: &Nfo, before: &HashMap<String, Read>) -> Contents {
    match before.get(&found.path) {
        Some(read) if found.modified.is_some() && read.modified == found.modified => Contents {
            edit: read.edit.clone(),
            tmdb: read.tmdb,
        },
        _ => nfo::read(Path::new(&found.path), root_of(found.subject_kind)),
    }
}

fn root_of(kind: &str) -> &'static [&'static str] {
    if kind == SHOW {
        &[nfo::TVSHOW]
    } else {
        &[nfo::MOVIE, nfo::EPISODE]
    }
}
