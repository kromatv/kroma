//! A file belongs to one library: no folder of a library holds, or sits below,
//! a folder of another.

use std::path::{Component, Path, PathBuf};

use super::LibraryDef;

/// Whether `outer` is `inner` or a folder above it. Both are compared part by
/// part once `.` and `..` are resolved, so `/media/Films` holds
/// `/media/Films/4K` and not `/media/Films 4K`. Links are not followed.
pub fn holds(outer: &str, inner: &str) -> bool {
    resolved(inner).starts_with(resolved(outer))
}

/// The library of `defs` that would share files with a library over
/// `folders`: one of its folders holds one of `folders`, or sits below one.
/// `except` is the library being edited, which never shares with itself.
pub fn library_sharing_files<'a>(
    defs: &'a [LibraryDef],
    folders: &[String],
    except: Option<&str>,
) -> Option<&'a LibraryDef> {
    defs.iter()
        .filter(|def| Some(def.id.as_str()) != except)
        .find(|def| def.folders.iter().any(|held| shares(held, folders)))
}

fn shares(held: &str, folders: &[String]) -> bool {
    folders
        .iter()
        .any(|folder| holds(held, folder) || holds(folder, held))
}

fn resolved(folder: &str) -> PathBuf {
    let mut path = PathBuf::new();
    for part in Path::new(folder.trim()).components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                path.pop();
            }
            other => path.push(other),
        }
    }
    path
}

#[cfg(test)]
mod tests;
