//! Whether a walk read every folder of a library whole, so the prune after it
//! knows which libraries' files it may remove.

use std::path::Path;

use tracing::warn;

use super::batches::Batches;
use super::found::LibraryWalk;
use super::walk::scan_root;

/// Why a walk did not read a folder of a library whole, so a scan removes none
/// of that library's files. A folder that is configured but really empty, or
/// one dangling link, holds the prune back the same way until it is fixed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Unread {
    Missing(String),
    Empty(String),
    Unreadable { folder: String, entries: usize },
}

/// A library the walk did not read whole, with every folder it could not read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnreadLibrary {
    pub id: String,
    pub name: String,
    pub unread: Vec<Unread>,
}

impl UnreadLibrary {
    /// One line per folder the walk could not read, for the owner.
    pub fn folders(&self) -> impl Iterator<Item = String> + '_ {
        self.unread.iter().map(|why| {
            let name = &self.name;
            match why {
                Unread::Missing(folder) => format!(
                    "{name}: the folder {folder} is not there; kept every title it holds"
                ),
                Unread::Empty(folder) => format!(
                    "{name}: the folder {folder} holds no video file (an empty mount point?); kept every title it holds"
                ),
                Unread::Unreadable { folder, entries } => format!(
                    "{name}: {entries} entries below {folder} could not be read (a link whose target is not mounted?); kept every title it holds"
                ),
            }
        })
    }
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
    let mut unread = Vec::new();
    for folder in &def.folders {
        let Some(why) = read_folder(folder, lib, batches)? else {
            continue;
        };
        if let Unread::Unreadable { entries, .. } = why {
            read.unreadable += entries;
        }
        unread.push(why);
    }
    read.unread = (!unread.is_empty()).then(|| UnreadLibrary {
        id: def.id.clone(),
        name: def.name.clone(),
        unread,
    });
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
        return Ok(Some(Unread::Unreadable {
            folder: folder.to_string(),
            entries: unreadable,
        }));
    }
    let empty = lib.found.mtimes.len() == files_before;
    Ok(empty.then(|| Unread::Empty(folder.to_string())))
}
