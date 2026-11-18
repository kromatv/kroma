//! The three paged reads of an import: a library's titles, one person's watch
//! state in one library, and the server's plays.

use std::collections::HashMap;

use anyhow::Result;

use super::halt::Halt;
use super::passage::{Passage, Person};
use super::pull::each_page;
use super::settle::{Key, Offer, Shelf, split};
use super::stages::{PlayRow, StatePage, StateRow, TitlePage};
use crate::db;
use crate::model::import::{Library, Play, Title, TitleKind, WatchState};
use crate::model::imports::Kind;
use crate::services::importers::{PlaysAsk, StatesAsk, TitlesAsk};
use crate::services::jobs::now_ms;

const CLOCK_SKEW_ALLOWANCE_SECS: i64 = 24 * 60 * 60;

fn now_secs() -> i64 {
    now_ms() / 1000
}

fn pass_key<P: serde::Serialize>(parts: &P) -> Result<String> {
    Ok(kroma_primitives::short_hash(&serde_json::to_string(parts)?))
}

fn plays_pass(people: &[Person<'_>], libraries: &[&Library]) -> Result<String> {
    let mut users: Vec<&str> = people.iter().map(|p| p.user.id.as_str()).collect();
    let mut kept: Vec<&str> = libraries.iter().map(|l| l.id.as_str()).collect();
    users.sort_unstable();
    kept.sort_unstable();
    pass_key(&("plays", users, kept))
}

impl Passage<'_> {
    fn changed_since(&self, pass: &str) -> Result<Option<i64>> {
        let read_at = db::imports::pass_read_at(self.pool(), &self.server_id, pass)?;
        Ok(read_at.map(|at| at - CLOCK_SKEW_ALLOWANCE_SECS))
    }

    fn close_pass(&self, pass: &str, began: i64, whole: bool) -> Result<()> {
        if whole {
            db::imports::set_pass_read_at(self.pool(), &self.server_id, pass, began)?;
        }
        Ok(())
    }

    fn described<'t>(&self, ids: impl Iterator<Item = &'t str>) -> Result<HashMap<String, Title>> {
        let ids: Vec<&str> = ids.collect();
        db::imports::described(self.pool(), &self.server_id, &ids)
    }

    pub(super) fn read_titles(
        &mut self,
        library: &Library,
        source: Option<&str>,
    ) -> Result<(), Halt> {
        let importers = self.importers()?;
        let mut ask = TitlesAsk {
            sign_in: self.sign_in(),
            server: self.import.server.id.clone(),
            library: library.id.clone(),
            cursor: None,
        };
        each_page(|cursor| {
            self.alive()?;
            ask.cursor = cursor.map(str::to_string);
            let page = importers.titles(&self.import.importer, &ask)?;
            self.title_page(library, source, &page.titles)?;
            Ok(page.next)
        })
    }

    fn title_page(
        &mut self,
        library: &Library,
        source: Option<&str>,
        titles: &[Title],
    ) -> Result<()> {
        self.report.titles.read += titles.len() as u64;
        let played: Vec<&Title> = titles
            .iter()
            .filter(|title| title.kind != TitleKind::Other)
            .collect();
        db::imports::describe(self.pool(), &self.server_id, &played)?;
        let offers = played
            .iter()
            .map(|title| {
                let key = Key::of(&title.id, title)?.about(&title.id);
                Ok(Offer { key, row: *title })
            })
            .collect::<Result<Vec<_>>>()?;
        let shelf = Shelf::of(Kind::Title);
        let (keys, rows) = split(self.fresh(shelf, offers)?);
        if rows.is_empty() {
            return Ok(());
        }
        let page = TitlePage {
            library,
            source,
            titles: &rows,
        };
        let outcomes = self.stages.titles(&self.importing(), &page)?;
        self.conclude(shelf, &keys, &outcomes)?;
        Ok(())
    }

    pub(super) fn read_states(
        &mut self,
        person: &Person<'_>,
        library: &Library,
    ) -> Result<(), Halt> {
        let importers = self.importers()?;
        let pass = pass_key(&("states", &person.user.id, &library.id))?;
        let began = now_secs();
        let mut ask = StatesAsk {
            sign_in: self.sign_in(),
            server: self.import.server.id.clone(),
            user: person.user.id.clone(),
            library: library.id.clone(),
            cursor: None,
            changed_since: self.changed_since(&pass)?,
        };
        let mut whole = true;
        each_page(|cursor| {
            self.alive()?;
            ask.cursor = cursor.map(str::to_string);
            let page = importers.states(&self.import.importer, &ask)?;
            whole &= self.state_page(person, &page.states)?;
            Ok(page.next)
        })?;
        Ok(self.close_pass(&pass, began, whole)?)
    }

    fn state_page(&mut self, person: &Person<'_>, states: &[WatchState]) -> Result<bool> {
        self.report.states.read += states.len() as u64;
        let titles = self.described(states.iter().map(|state| state.title.as_str()))?;
        let offers = states
            .iter()
            .filter_map(|state| Some((state, titles.get(&state.title)?)))
            .map(|(state, title)| {
                let key = Key::of(&state.title, state)?.about(&state.title);
                let row = StateRow { state, title };
                Ok(Offer { key, row })
            })
            .collect::<Result<Vec<_>>>()?;
        let shelf = Shelf {
            kind: Kind::State,
            scope: &person.user.id,
        };
        let (keys, rows) = split(self.fresh(shelf, offers)?);
        if rows.is_empty() {
            return Ok(true);
        }
        let page = StatePage {
            user: person.user,
            account: person.account,
            rows: &rows,
        };
        let outcomes = self.stages.states(&self.importing(), &page)?;
        self.conclude(shelf, &keys, &outcomes)
    }

    pub(super) fn read_plays(
        &mut self,
        people: &[Person<'_>],
        libraries: &[&Library],
    ) -> Result<(), Halt> {
        let importers = self.importers()?;
        let pass = plays_pass(people, libraries)?;
        let began = now_secs();
        let mut ask = PlaysAsk {
            sign_in: self.sign_in(),
            server: self.import.server.id.clone(),
            cursor: None,
            changed_since: self.changed_since(&pass)?,
        };
        let accounts: HashMap<&str, &str> = people
            .iter()
            .map(|person| (person.user.id.as_str(), person.account))
            .collect();
        let mut whole = true;
        each_page(|cursor| {
            self.alive()?;
            ask.cursor = cursor.map(str::to_string);
            let page = importers.plays(&self.import.importer, &ask)?;
            whole &= self.play_page(&accounts, &page.plays)?;
            Ok(page.next)
        })?;
        Ok(self.close_pass(&pass, began, whole)?)
    }

    fn play_page(&mut self, accounts: &HashMap<&str, &str>, plays: &[Play]) -> Result<bool> {
        self.report.plays.read += plays.len() as u64;
        let titles = self.described(plays.iter().map(|play| play.title.as_str()))?;
        let offers = plays
            .iter()
            .filter_map(|play| {
                let account = accounts.get(play.user.as_str())?;
                Some((play, titles.get(&play.title)?, *account))
            })
            .map(|(play, title, account)| {
                let key = Key::of(&play.id, play)?.about(&play.title);
                let row = PlayRow {
                    play,
                    title,
                    account,
                };
                Ok(Offer { key, row })
            })
            .collect::<Result<Vec<_>>>()?;
        let shelf = Shelf::of(Kind::Play);
        let (keys, rows) = split(self.fresh(shelf, offers)?);
        if rows.is_empty() {
            return Ok(true);
        }
        let outcomes = self.stages.plays(&self.importing(), &rows)?;
        self.conclude(shelf, &keys, &outcomes)
    }
}
