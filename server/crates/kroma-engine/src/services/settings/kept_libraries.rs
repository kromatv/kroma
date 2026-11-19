//! The rule a saved library list answers to: it names every library of the
//! owner's that the index holds. The next scan removes a library the list
//! leaves out, with what was watched in it, so leaving one out is what deleting
//! a library does and nothing else.

use serde_json::Value;

use crate::db::Pool;
use crate::i18n;

use super::library_list::library_list;

/// A library of the owner's that the index holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HeldLibrary {
    pub id: String,
    pub name: String,
}

/// The owner's libraries the index holds: every one but the demo libraries,
/// which are nobody's to lose.
pub fn held_libraries(pool: &Pool) -> anyhow::Result<Vec<HeldLibrary>> {
    let held = crate::db::list_libraries(pool)?
        .into_iter()
        .filter(|library| !is_demo(&library.id))
        .map(|library| HeldLibrary {
            id: library.id,
            name: library.name,
        })
        .collect();
    Ok(held)
}

fn is_demo(id: &str) -> bool {
    super::is_demo_library(id) || crate::services::demo::is_demo_library(id)
}

/// Why a value may not replace the saved library list.
#[derive(Debug, PartialEq, Eq)]
pub enum Refusal {
    NotAList,
    LeavesOut(Vec<HeldLibrary>),
}

/// Whether `value` may replace the saved library list: `None` when it is null
/// or a list, and names every library [`held_libraries`] gives. Null and the
/// empty list name none, so they pass only while the index holds none.
pub fn refusal(pool: &Pool, value: &Value) -> anyhow::Result<Option<Refusal>> {
    let Ok(list) = library_list(value) else {
        return Ok(Some(Refusal::NotAList));
    };
    let named = list.unwrap_or_default();
    let left_out: Vec<HeldLibrary> = held_libraries(pool)?
        .into_iter()
        .filter(|held| named.iter().all(|def| def.id != held.id))
        .collect();
    Ok((!left_out.is_empty()).then_some(Refusal::LeavesOut(left_out)))
}

/// A message for the owner about the library list: a key of the shared
/// catalogs, and the libraries it names as the `libraries` value of that key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LibraryNotice {
    pub key: &'static str,
    pub libraries: String,
}

impl LibraryNotice {
    fn naming(key: &'static str, libraries: &[HeldLibrary]) -> Self {
        let named: Vec<String> = libraries
            .iter()
            .map(|library| format!("{} ({})", library.name, library.id))
            .collect();
        LibraryNotice {
            key,
            libraries: named.join(", "),
        }
    }

    pub fn said_in(&self, locale: &str) -> String {
        i18n::t(locale, self.key, &[("libraries", &self.libraries)])
    }
}

impl Refusal {
    pub fn notice(&self) -> LibraryNotice {
        match self {
            Refusal::NotAList => LibraryNotice::naming("error.librariesNotAList", &[]),
            Refusal::LeavesOut(left_out) => {
                LibraryNotice::naming("error.librariesLeftOut", left_out)
            }
        }
    }
}

/// What to tell the owner when the saved list cannot be read: the way out is
/// to save it again with every library the index holds, which it names. An
/// index that does not read names none.
pub fn unreadable_list_notice(pool: &Pool) -> LibraryNotice {
    let held = held_libraries(pool).unwrap_or_default();
    if held.is_empty() {
        return LibraryNotice::naming("error.libraryListUnreadable", &held);
    }
    LibraryNotice::naming("error.libraryListUnreadableKeep", &held)
}

/// [`unreadable_list_notice`] as the failure of a scan, in the default
/// language: a job has no reader whose language it could ask for.
pub fn unreadable_list_failure(pool: &Pool) -> anyhow::Error {
    anyhow::anyhow!(unreadable_list_notice(pool).said_in(i18n::DEFAULT_LOCALE))
}

#[cfg(test)]
mod tests;
