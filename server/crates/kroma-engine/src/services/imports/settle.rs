//! What becomes of a page of rows: the ones the record holds unchanged are
//! dropped, a stage takes the rest, and what it answers is recorded, counted
//! and, for a title that matched nothing, listed.

use anyhow::{Result, ensure};
use serde::Serialize;

use super::passage::Passage;
use super::stages::Outcome;
use crate::db;
use crate::db::imports::{Entry, Ledger};
use crate::model::imports::Kind;

/// How the record names one row. `title` is the title the report lists when
/// the row matches nothing.
pub(super) struct Key<'a> {
    pub id: &'a str,
    pub fingerprint: String,
    pub title: Option<&'a str>,
}

impl<'a> Key<'a> {
    pub(super) fn of<R: Serialize>(id: &'a str, row: &R) -> Result<Self> {
        let described = serde_json::to_string(row)?;
        Ok(Self {
            id,
            fingerprint: kroma_primitives::short_hash(&described),
            title: None,
        })
    }

    pub(super) fn about(self, title: &'a str) -> Self {
        Self {
            title: Some(title),
            ..self
        }
    }
}

pub(super) struct Offer<'a, R> {
    pub key: Key<'a>,
    pub row: R,
}

/// The rows of one kind a page holds. `scope` is the user a watch state is of.
#[derive(Clone, Copy)]
pub(super) struct Shelf<'a> {
    pub kind: Kind,
    pub scope: &'a str,
}

impl Shelf<'static> {
    pub(super) fn of(kind: Kind) -> Self {
        Self { kind, scope: "" }
    }
}

pub(super) fn split<R>(offers: Vec<Offer<'_, R>>) -> (Vec<Key<'_>>, Vec<R>) {
    offers
        .into_iter()
        .map(|offer| (offer.key, offer.row))
        .unzip()
}

impl Passage<'_> {
    fn ledger<'s>(&'s self, shelf: Shelf<'s>) -> Ledger<'s> {
        Ledger {
            server_id: &self.server_id,
            kind: shelf.kind,
            scope: shelf.scope,
        }
    }

    /// The offers the record does not hold as they are now.
    pub(super) fn fresh<'r, R>(
        &self,
        shelf: Shelf<'_>,
        offers: Vec<Offer<'r, R>>,
    ) -> Result<Vec<Offer<'r, R>>> {
        let ids: Vec<&str> = offers.iter().map(|offer| offer.key.id).collect();
        let held = db::imports::brought(self.pool(), &self.ledger(shelf), &ids)?;
        Ok(offers
            .into_iter()
            .filter(|offer| {
                held.get(offer.key.id)
                    .is_none_or(|brought| brought.fingerprint != offer.key.fingerprint)
            })
            .collect())
    }

    /// Records and counts what a stage answered for `keys`. False when a row is
    /// left for a later import.
    pub(super) fn conclude(
        &mut self,
        shelf: Shelf<'_>,
        keys: &[Key<'_>],
        outcomes: &[Outcome],
    ) -> Result<bool> {
        ensure!(
            keys.len() == outcomes.len(),
            "the {} stage answered {} rows for the {} it was given",
            shelf.kind.as_str(),
            outcomes.len(),
            keys.len()
        );
        let answered = Answered::sort(keys, outcomes);
        let tally = self.report.tally_mut(shelf.kind);
        tally.brought += answered.brought;
        tally.unmatched += answered.unmatched.len() as u64;
        self.record(shelf, &answered.settled)?;
        self.list_unmatched(&answered.unmatched)?;
        Ok(answered.settled.len() == keys.len())
    }

    fn record(&self, shelf: Shelf<'_>, settled: &[(&Key<'_>, Option<&str>)]) -> Result<()> {
        let entries: Vec<Entry<'_>> = settled
            .iter()
            .map(|(key, target)| Entry {
                id: key.id,
                fingerprint: &key.fingerprint,
                target: *target,
            })
            .collect();
        db::imports::record(self.pool(), &self.ledger(shelf), &self.import.id, &entries)
    }

    fn list_unmatched(&self, unmatched: &[&Key<'_>]) -> Result<()> {
        let titles: Vec<&str> = unmatched.iter().filter_map(|key| key.title).collect();
        db::imports::add_unmatched(self.pool(), &self.import.id, &titles)
    }
}

#[derive(Default)]
struct Answered<'k, 'a> {
    settled: Vec<(&'k Key<'a>, Option<&'k str>)>,
    unmatched: Vec<&'k Key<'a>>,
    brought: u64,
}

impl<'k, 'a> Answered<'k, 'a> {
    fn sort(keys: &'k [Key<'a>], outcomes: &'k [Outcome]) -> Self {
        let mut answered = Self::default();
        for (key, outcome) in keys.iter().zip(outcomes) {
            match outcome {
                Outcome::Brought { target } => {
                    answered.brought += 1;
                    answered.settled.push((key, target.as_deref()));
                }
                Outcome::AlreadyHere => answered.settled.push((key, None)),
                Outcome::Unmatched => answered.unmatched.push(key),
                Outcome::Untouched => {}
            }
        }
        answered
    }
}
