//! One person's watched flags, resume points and favourites, merged into what
//! KROMA holds for their account. A state whose title is nothing here answers
//! `Unmatched`, and one KROMA holds newer answers `AlreadyHere`.
//!
//! A state for a file no scan has reached yet is held, and answers `Brought`:
//! it is in KROMA's keeping from then on, and shows on its title in the write
//! that brings the file into the catalogue. A later import is therefore not
//! offered it again, and offering it again would change nothing.

mod bounded;

use anyhow::Result;

use self::bounded::bounded;
use super::found::{Found, find};
use super::{Importing, Outcome, StatePage};
use crate::db;
use crate::db::imports::{Merged, Place};
use crate::domain::watching::Watching;
use crate::model::import::Title;
use crate::services::jobs::now_ms;

pub(super) fn merge(importing: &Importing<'_>, page: &StatePage<'_>) -> Result<Vec<Outcome>> {
    let now_secs = now_ms() / 1000;
    let carrying: Vec<(usize, Watching)> = page
        .rows
        .iter()
        .map(|row| bounded(row.state, now_secs))
        .enumerate()
        .filter(|(_, state)| !state.is_empty())
        .collect();
    let titles: Vec<&Title> = carrying
        .iter()
        .map(|(row, _)| page.rows[*row].title)
        .collect();
    let found = find(importing, &titles)?;
    let mut outcomes = vec![Outcome::AlreadyHere; page.rows.len()];
    let mut rows = Vec::new();
    let mut placed = Vec::new();
    for ((row, state), found) in carrying.iter().zip(&found) {
        match place_of(found) {
            Some(place) => {
                rows.push(*row);
                placed.push((place, *state));
            }
            None => outcomes[*row] = Outcome::Unmatched,
        }
    }
    let merged = db::imports::merge_states(&importing.state.db, page.account, &placed)?;
    for (row, merged) in rows.into_iter().zip(merged) {
        outcomes[row] = outcome_of(merged);
    }
    Ok(outcomes)
}

fn place_of(found: &Found) -> Option<Place<'_>> {
    match found {
        Found::Title(item) => Some(Place::Title(item)),
        Found::Awaited(file) => Some(Place::File(file)),
        Found::Nothing => None,
    }
}

fn outcome_of(merged: Merged) -> Outcome {
    match merged {
        Merged::Changed => Outcome::Brought { target: None },
        Merged::Unchanged => Outcome::AlreadyHere,
        Merged::Gone => Outcome::Untouched,
    }
}
