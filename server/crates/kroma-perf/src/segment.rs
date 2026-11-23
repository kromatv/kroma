use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use twox_hash::XxHash3_128;

/// What SQLite counted while one statement ran. Zero for a segment that is not
/// a statement.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Counters {
    pub rows: u64,
    pub full_scan_steps: u64,
    pub sorts: u64,
    pub auto_indexes: u64,
}

impl Counters {
    pub fn add(&mut self, other: &Counters) {
        *self = Counters {
            rows: self.rows + other.rows,
            full_scan_steps: self.full_scan_steps + other.full_scan_steps,
            sorts: self.sorts + other.sorts,
            auto_indexes: self.auto_indexes + other.auto_indexes,
        };
    }
}

/// A piece of work its caller timed: what it was (`"http"`, `"fs"`, ...), its
/// name, where it ran (a host, a path), and how long it took.
#[derive(Clone, Copy, Debug)]
pub struct Measured<'a> {
    pub kind: &'static str,
    pub label: &'a str,
    pub origin: Option<&'a str>,
    pub elapsed: Duration,
}

/// One timed piece of work: a statement, a span, or anything a caller measured
/// with [`crate::measure`]. `key` names it in the [`Catalog`]. A segment nested
/// in another of its kind (a span inside a span) keeps its own figures but is
/// left out of its kind's total, which would otherwise count the time twice.
#[derive(Clone, Copy, Debug)]
pub struct Segment {
    pub kind: &'static str,
    pub key: u64,
    pub elapsed_ns: u64,
    pub counters: Counters,
    pub nested: bool,
}

/// What a segment key stands for. `origin` is where it ran: the database a
/// statement ran against, the `file:line` of a span, the host of a call.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Descriptor {
    pub kind: String,
    pub label: String,
    pub origin: Option<String>,
}

#[derive(Default)]
struct Entries {
    known: HashMap<u64, Descriptor>,
    unsaved: Vec<u64>,
}

/// The process-wide dictionary from segment key to [`Descriptor`]. A key is a
/// hash of kind, label and origin, so the same work gets the same key in every
/// run and the stored history stays joinable.
#[derive(Default)]
pub struct Catalog(Mutex<Entries>);

impl Catalog {
    pub fn key_for(&self, kind: &str, label: &str, origin: Option<&str>) -> u64 {
        let key = key_of(kind, label, origin);
        let mut entries = self.0.lock().unwrap();
        if let Entry::Vacant(slot) = entries.known.entry(key) {
            slot.insert(Descriptor {
                kind: kind.to_string(),
                label: label.to_string(),
                origin: origin.map(str::to_string),
            });
            entries.unsaved.push(key);
        }
        key
    }

    pub fn describe(&self, key: u64) -> Option<Descriptor> {
        self.0.lock().unwrap().known.get(&key).cloned()
    }

    pub fn adopt(&self, saved: Vec<(u64, Descriptor)>) {
        let mut entries = self.0.lock().unwrap();
        for (key, descriptor) in saved {
            entries.known.entry(key).or_insert(descriptor);
        }
    }

    pub fn take_unsaved(&self) -> Vec<(u64, Descriptor)> {
        let mut entries = self.0.lock().unwrap();
        let unsaved = std::mem::take(&mut entries.unsaved);
        unsaved
            .into_iter()
            .filter_map(|key| Some((key, entries.known.get(&key)?.clone())))
            .collect()
    }

    #[cfg(test)]
    pub fn all(&self) -> Vec<(u64, Descriptor)> {
        let entries = self.0.lock().unwrap();
        entries.known.iter().map(|(k, d)| (*k, d.clone())).collect()
    }
}

fn key_of(kind: &str, label: &str, origin: Option<&str>) -> u64 {
    let text = format!("{kind}\u{0}{label}\u{0}{}", origin.unwrap_or_default());
    let wide = XxHash3_128::oneshot(text.as_bytes());
    (wide as u64) & (i64::MAX as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_work_gets_the_same_key_every_time() {
        let catalog = Catalog::default();

        let first = catalog.key_for("sql", "SELECT 1", Some("core"));
        let again = catalog.key_for("sql", "SELECT 1", Some("core"));

        assert_eq!(first, again);
        assert_eq!(
            first,
            Catalog::default().key_for("sql", "SELECT 1", Some("core"))
        );
    }

    #[test]
    fn the_same_statement_on_two_databases_is_two_entries() {
        let catalog = Catalog::default();

        let core = catalog.key_for("sql", "SELECT 1", Some("core"));
        let module = catalog.key_for("sql", "SELECT 1", Some("tv.kroma.acquisition"));

        assert_ne!(core, module);
        assert_eq!(
            catalog.describe(module).unwrap().origin.as_deref(),
            Some("tv.kroma.acquisition")
        );
    }

    #[test]
    fn only_entries_added_since_the_last_save_are_handed_over() {
        let catalog = Catalog::default();
        catalog.adopt(vec![(7, Descriptor {
            kind: "sql".into(),
            label: "SELECT 7".into(),
            origin: None,
        })]);
        let first = catalog.key_for("sql", "SELECT 1", Some("core"));

        let saved = catalog.take_unsaved();
        catalog.key_for("sql", "SELECT 1", Some("core"));

        assert_eq!(saved.iter().map(|(k, _)| *k).collect::<Vec<_>>(), vec![first]);
        assert!(catalog.take_unsaved().is_empty());
    }

    #[test]
    fn a_key_fits_a_signed_sqlite_integer() {
        let key = Catalog::default().key_for("span", "build_home", None);

        assert!(i64::try_from(key).is_ok());
    }
}
