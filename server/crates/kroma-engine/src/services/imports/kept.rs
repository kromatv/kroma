//! What the owner kept of the other server's libraries and users, and what
//! each became here: a library its source, a user their account.

use std::collections::HashMap;

use anyhow::Result;

use super::halt::Halt;
use super::passage::Passage;
use super::settle::{Key, Shelf};
use super::stages::{LibraryRow, UserRow, UserRows};
use crate::db;
use crate::model::import::{Library, LibraryKind, Survey, User};
use crate::model::imports::{KeptLibrary, KeptUser, Kind, Selection};

pub(super) type Kept<'a, T, K> = Vec<(&'a T, &'a K)>;

pub(super) fn kept_libraries<'a>(
    survey: &'a Survey,
    selection: &'a Selection,
) -> Kept<'a, Library, KeptLibrary> {
    selection
        .libraries
        .iter()
        .filter_map(|kept| {
            let library = survey.libraries.iter().find(|l| l.id == kept.id)?;
            (library.kind != LibraryKind::Other).then_some((library, kept))
        })
        .collect()
}

pub(super) fn kept_users<'a>(
    survey: &'a Survey,
    selection: &'a Selection,
) -> Kept<'a, User, KeptUser> {
    selection
        .users
        .iter()
        .filter_map(|kept| {
            let user = survey.users.iter().find(|u| u.id == kept.id)?;
            Some((user, kept))
        })
        .collect()
}

impl Passage<'_> {
    fn targets(&self, kind: Kind) -> Result<HashMap<String, String>> {
        db::imports::targets(self.pool(), &self.server_id, kind)
    }

    pub(super) fn place_libraries(
        &mut self,
        kept: &Kept<'_, Library, KeptLibrary>,
    ) -> Result<HashMap<String, String>, Halt> {
        let known = self.targets(Kind::Library)?;
        let rows: Vec<LibraryRow<'_>> = kept
            .iter()
            .map(|(library, kept)| LibraryRow {
                library,
                kept,
                source: known.get(&library.id).map(String::as_str),
            })
            .collect();
        let keys = kept
            .iter()
            .map(|(library, _)| Key::of(&library.id, library))
            .collect::<Result<Vec<_>>>()?;
        let outcomes = self.stages.libraries(&self.importing(), &rows)?;
        self.report.libraries.read += rows.len() as u64;
        self.conclude(Shelf::of(Kind::Library), &keys, &outcomes)?;
        Ok(self.targets(Kind::Library)?)
    }

    pub(super) fn settle_users(
        &mut self,
        kept: &Kept<'_, User, KeptUser>,
        sources: &HashMap<String, String>,
    ) -> Result<HashMap<String, String>, Halt> {
        let known = self.targets(Kind::User)?;
        let rows: Vec<UserRow<'_>> = kept
            .iter()
            .map(|(user, kept)| UserRow {
                user,
                kept,
                account: known.get(&user.id).map(String::as_str),
            })
            .collect();
        let keys = kept
            .iter()
            .map(|(user, _)| Key::of(&user.id, user))
            .collect::<Result<Vec<_>>>()?;
        let users = UserRows {
            rows: &rows,
            sources,
        };
        let outcomes = self.stages.users(&self.importing(), &users)?;
        self.report.users.read += rows.len() as u64;
        self.conclude(Shelf::of(Kind::User), &keys, &outcomes)?;
        Ok(self.targets(Kind::User)?)
    }
}
