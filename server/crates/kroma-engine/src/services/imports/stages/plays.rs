//! The plays the other server recorded, added to watch history as rows that
//! came from an import. A play whose title is nothing here answers
//! `Unmatched`, and one watch history already has answers `AlreadyHere`.
//!
//! A play is the same play when the same server gives it the same id. Two
//! people who played one title in the same second are two plays, also when
//! both are attached to one account.
//!
//! A play for a file no scan has reached yet is held, and answers `Brought`:
//! it is in KROMA's keeping from then on, and joins watch history in the write
//! that brings the file into the catalogue. A play with no believable time is
//! settled with nothing written, so a later import is offered it again only
//! when the other server changes it.

mod bounded;

use anyhow::Result;

use self::bounded::bounded;
use super::found::{Found, find};
use super::{outcome_of, Importing, Outcome, PlayRow};
use crate::db;
use crate::db::imports::{NewPlay, Place};
use crate::model::import::Title;
use crate::services::jobs::now_ms;

enum Sorted<'a> {
    Add(NewPlay<'a>),
    Answered(Outcome),
}

impl<'a> Sorted<'a> {
    fn of(row: &PlayRow<'a>, found: &'a Found, now_secs: i64) -> Self {
        let Some(timed) = bounded(row.play, now_secs) else {
            return Self::Answered(Outcome::AlreadyHere);
        };
        let place = match found {
            Found::Title(item) => Place::Title(item),
            Found::Awaited(file) => Place::File(file),
            Found::Nothing => return Self::Answered(Outcome::Unmatched),
        };
        Self::Add(NewPlay {
            id: &row.play.id,
            account: row.account,
            place,
            played_at: timed.played_at,
            duration_ms: timed.duration_ms,
        })
    }

    fn play(&self) -> Option<NewPlay<'a>> {
        match self {
            Self::Add(play) => Some(*play),
            Self::Answered(_) => None,
        }
    }
}

pub(super) fn add(importing: &Importing<'_>, page: &[PlayRow<'_>]) -> Result<Vec<Outcome>> {
    let now_secs = now_ms() / 1000;
    let titles: Vec<&Title> = page.iter().map(|row| row.title).collect();
    let found = find(importing, &titles)?;
    let sorted: Vec<Sorted<'_>> = page
        .iter()
        .zip(&found)
        .map(|(row, found)| Sorted::of(row, found, now_secs))
        .collect();
    let plays: Vec<NewPlay<'_>> = sorted.iter().filter_map(Sorted::play).collect();
    let pool = &importing.state.db;
    let mut added = db::imports::add_plays(pool, importing.server_id, &plays)?.into_iter();
    let outcomes = sorted.into_iter().map(|row| match row {
        Sorted::Answered(outcome) => outcome,
        Sorted::Add(_) => added.next().map_or(Outcome::Untouched, outcome_of),
    });
    Ok(outcomes.collect())
}
