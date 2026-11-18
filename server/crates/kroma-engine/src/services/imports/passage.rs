//! One import, from the survey of the other server to its last page.

use std::collections::HashMap;
use std::sync::Arc;

use super::halt::Halt;
use super::kept::{Kept, kept_libraries, kept_users};
use super::stages::{Importing, Stages};
use crate::db;
use crate::model::import::{Library, Survey, User};
use crate::model::imports::{Import, KeptLibrary, Report};
use crate::services::importers::{Importers, SurveyAsk, Unanswered};
use crate::services::jobs::JobContext;

const LOGGED_NAME_CHARS: usize = 80;

pub(super) struct Passage<'a> {
    pub(super) ctx: &'a JobContext,
    pub(super) stages: &'a dyn Stages,
    pub(super) import: &'a Import,
    pub(super) server_id: String,
    pub(super) report: Report,
    importers: Option<Arc<Importers>>,
    passes_read: usize,
    passes: usize,
}

/// A user the owner kept who has an account here.
pub(super) struct Person<'a> {
    pub user: &'a User,
    pub account: &'a str,
}

fn sees(user: &User, library: &Library) -> bool {
    user.all_libraries || user.libraries.contains(&library.id)
}

fn state_passes<'p, 'a>(
    people: &'p [Person<'a>],
    libraries: &Kept<'a, Library, KeptLibrary>,
) -> Vec<(&'p Person<'a>, &'a Library)> {
    people
        .iter()
        .filter(|person| !person.user.state_locked)
        .flat_map(|person| libraries.iter().map(move |(library, _)| (person, *library)))
        .filter(|(person, library)| sees(person.user, library))
        .collect()
}

pub(super) fn logged(name: &str, id: &str) -> String {
    let name = kroma_primitives::clean_label(name, LOGGED_NAME_CHARS);
    if name.is_empty() {
        kroma_primitives::clean_label(id, LOGGED_NAME_CHARS)
    } else {
        name
    }
}

impl<'a> Passage<'a> {
    pub(super) fn new(ctx: &'a JobContext, stages: &'a dyn Stages, import: &'a Import) -> Self {
        Self {
            ctx,
            stages,
            import,
            server_id: db::imports::server_key(&import.importer, &import.server.id),
            report: Report::default(),
            importers: kroma_module_host::service::<Importers>(ctx.state.as_ref()),
            passes_read: 0,
            passes: 0,
        }
    }

    pub(super) fn pool(&self) -> &db::Pool {
        &self.ctx.state.db
    }

    pub(super) fn importers(&self) -> Result<Arc<Importers>, Halt> {
        self.importers
            .clone()
            .ok_or(Halt::Importer(Unanswered::Absent))
    }

    pub(super) fn sign_in(&self) -> String {
        self.import.sign_in.clone().unwrap_or_default()
    }

    pub(super) fn importing(&self) -> Importing<'_> {
        Importing {
            state: &self.ctx.state,
            import: self.import,
            server_id: &self.server_id,
        }
    }

    pub(super) fn alive(&self) -> Result<(), Halt> {
        if self.ctx.cancelled() {
            return Err(Halt::Cancelled);
        }
        Ok(())
    }

    pub(super) fn bring_over(&mut self) -> Result<(), Halt> {
        let survey = self.survey()?;
        let libraries = kept_libraries(&survey, &self.import.selection);
        let users = kept_users(&survey, &self.import.selection);
        let sources = self.place_libraries(&libraries)?;
        let accounts = self.settle_users(&users, &sources)?;
        let people: Vec<Person<'_>> = users
            .iter()
            .filter_map(|(user, _)| {
                let account = accounts.get(&user.id)?;
                Some(Person { user, account })
            })
            .collect();
        let watched = state_passes(&people, &libraries);
        self.passes = libraries.len() + watched.len() + usize::from(!people.is_empty());
        self.read_titles_of(&libraries, &sources)?;
        self.read_states_of(&watched)?;
        self.read_plays_of(&people, &libraries)
    }

    fn survey(&self) -> Result<Survey, Halt> {
        self.alive()?;
        let ask = SurveyAsk {
            sign_in: self.sign_in(),
            server: self.import.server.id.clone(),
        };
        let survey = self.importers()?.survey(&self.import.importer, &ask)?;
        self.alive()?;
        Ok(survey)
    }

    fn read_titles_of(
        &mut self,
        libraries: &Kept<'_, Library, KeptLibrary>,
        sources: &HashMap<String, String>,
    ) -> Result<(), Halt> {
        for (library, _) in libraries {
            let source = sources.get(&library.id).map(String::as_str);
            self.read_titles(library, source)?;
            self.passed(format!(
                "read the titles of {}",
                logged(&library.name, &library.id)
            ))?;
        }
        Ok(())
    }

    fn read_states_of(&mut self, watched: &[(&Person<'_>, &Library)]) -> Result<(), Halt> {
        for (person, library) in watched {
            self.read_states(person, library)?;
            self.passed(format!(
                "read the watch state of {} in {}",
                logged(&person.user.name, &person.user.id),
                logged(&library.name, &library.id)
            ))?;
        }
        Ok(())
    }

    fn read_plays_of(
        &mut self,
        people: &[Person<'_>],
        libraries: &Kept<'_, Library, KeptLibrary>,
    ) -> Result<(), Halt> {
        if people.is_empty() {
            return Ok(());
        }
        let libraries: Vec<&Library> = libraries.iter().map(|(library, _)| *library).collect();
        self.read_plays(people, &libraries)?;
        self.passed("read the plays".to_string())
    }

    fn passed(&mut self, what: String) -> Result<(), Halt> {
        self.passes_read += 1;
        self.ctx.progress(self.passes_read, self.passes);
        self.ctx.info(what);
        db::imports::save_report(self.pool(), &self.import.id, &self.report)?;
        Ok(())
    }
}
