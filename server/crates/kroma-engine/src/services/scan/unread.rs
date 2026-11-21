//! Whether a walk read every folder of a library whole, so the prune after it
//! knows which libraries' files it may remove.

use std::path::Path;

use tracing::warn;

use super::batches::Batches;
use super::found::LibraryWalk;
use super::walk::scan_root;

/// Why a walk did not read a library whole, so a scan removes none of its
/// files. A folder that is configured but really empty, or one dangling link,
/// holds the prune back the same way until it is fixed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Unread {
    Missing(String),
    Empty(String),
    Unreadable(usize),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnreadLibrary {
    pub id: String,
    pub name: String,
    pub why: Unread,
}

#[derive(Default)]
pub(super) struct LibraryRead {
    pub unreadable: usize,
    pub unread: Option<UnreadLibrary>,
}

pub(super) fn read_library<S>(
    lib: &mut LibraryWalk<'_>,
    batches: &mut Batches<'_, S>,
) -> Result<LibraryRead, S> {
    let def = lib.def;
    let mut read = LibraryRead::default();
    for folder in &def.folders {
        let Some(why) = read_folder(folder, lib, batches)? else {
            continue;
        };
        if let Unread::Unreadable(entries) = why {
            read.unreadable += entries;
        }
        read.unread.get_or_insert_with(|| UnreadLibrary {
            id: def.id.clone(),
            name: def.name.clone(),
            why,
        });
    }
    Ok(read)
}

fn read_folder<S>(
    folder: &str,
    lib: &mut LibraryWalk<'_>,
    batches: &mut Batches<'_, S>,
) -> Result<Option<Unread>, S> {
    let root = Path::new(folder);
    if !root.is_dir() {
        warn!(path = %root.display(), "media dir does not exist or is not a directory; skipping");
        return Ok(Some(Unread::Missing(folder.to_string())));
    }
    let files_before = lib.found.mtimes.len();
    let unreadable = scan_root(root, lib, batches)?;
    if unreadable > 0 {
        return Ok(Some(Unread::Unreadable(unreadable)));
    }
    let empty = lib.found.mtimes.len() == files_before;
    Ok(empty.then(|| Unread::Empty(folder.to_string())))
}
