//! The users the owner kept become accounts that wait on an invitation, each
//! seeing the libraries its user could see. A user that gets an account in
//! this import, new or one it is attached to, answers `Brought` with that
//! account's id. A user an earlier import gave one answers `AlreadyHere`.
//!
//! An account is looked for before one is made: the one an earlier import
//! gave the user, the owner's for the person who signed in to the other
//! server, then the one the owner chose. Only a new account gets libraries and
//! an invitation from the import: one that was here is left as it stands.
//!
//! Two users of one server share an account only where the owner attached
//! them to it. An address several kept users carry is nobody's, and no user is
//! proposed the account another user of that server has.

mod described;

use std::collections::{HashMap, HashSet};

use anyhow::Result;

use self::described::{address_of, name_of, shared_addresses, visibility};
use super::{Importing, Outcome, UserRow, UserRows};
use crate::db;
use crate::db::imports::{Draft, Newcomer};
use crate::model::import::User;
use crate::model::imports::{AccountChoice, Kind};
use crate::services::auth;
use crate::services::sso::admit::free_username;

pub(super) fn settle(importing: &Importing<'_>, kept: &UserRows<'_>) -> Result<Vec<Outcome>> {
    let pool = &importing.state.db;
    let owner = here(pool, importing.import.started_by.as_deref())?;
    let mut homes = db::imports::targets(pool, importing.server_id, Kind::User)?;
    for row in kept.rows {
        if let Asked::Account(Some(account)) = asked_for(row, owner.as_deref()) {
            homes
                .entry(row.user.id.clone())
                .or_insert_with(|| account.to_string());
        }
    }
    let settling = Settling {
        importing,
        owner,
        sources: kept.sources,
        homes,
        shared: shared_addresses(kept.rows.iter().map(|row| row.user)),
    };
    kept.rows.iter().map(|row| settling.settle(row)).collect()
}

struct Settling<'a> {
    importing: &'a Importing<'a>,
    owner: Option<String>,
    sources: &'a HashMap<String, String>,
    homes: HashMap<String, String>,
    shared: HashSet<String>,
}

enum Asked<'a> {
    Account(Option<&'a str>),
    Proposed,
    New,
}

fn asked_for<'a>(row: &'a UserRow<'_>, owner: Option<&'a str>) -> Asked<'a> {
    if row.user.signed_in {
        return Asked::Account(owner);
    }
    match &row.kept.account {
        AccountChoice::Existing(id) => Asked::Account(Some(id)),
        AccountChoice::Proposed => Asked::Proposed,
        AccountChoice::New => Asked::New,
    }
}

fn here(pool: &db::Pool, account: Option<&str>) -> Result<Option<String>> {
    let Some(id) = account else {
        return Ok(None);
    };
    Ok(db::user_by_id(pool, id)?.map(|account| account.id))
}

fn holding(pool: &db::Pool, address: Option<&str>) -> Result<Option<String>> {
    let Some(address) = address else {
        return Ok(None);
    };
    Ok(db::find_user_by_email(pool, address)?.map(|(account, _)| account.id))
}

impl Settling<'_> {
    fn pool(&self) -> &db::Pool {
        &self.importing.state.db
    }

    fn settle(&self, row: &UserRow<'_>) -> Result<Outcome> {
        if here(self.pool(), row.account)?.is_some() {
            return Ok(Outcome::AlreadyHere);
        }
        let account = match asked_for(row, self.owner.as_deref()) {
            Asked::Account(id) => here(self.pool(), id)?,
            Asked::Proposed => match self.proposed(row.user)? {
                Some(holder) => Some(holder),
                None => self.create(row.user)?,
            },
            Asked::New => self.create(row.user)?,
        };
        Ok(account.map_or(Outcome::Untouched, |id| Outcome::Brought {
            target: Some(id),
        }))
    }

    fn own_address(&self, user: &User) -> Option<String> {
        address_of(user).filter(|address| !self.shared.contains(address))
    }

    fn proposed(&self, user: &User) -> Result<Option<String>> {
        let holder = holding(self.pool(), self.own_address(user).as_deref())?;
        Ok(holder.filter(|account| {
            let another_users = |(id, home): (&String, &String)| home == account && *id != user.id;
            !self.homes.iter().any(another_users)
        }))
    }

    fn create(&self, user: &User) -> Result<Option<String>> {
        let pool = self.pool();
        let username = free_username(pool, &name_of(user))?;
        let address = self.own_address(user);
        let email = match holding(pool, address.as_deref())? {
            Some(_) => None,
            None => address.as_deref(),
        };
        let libraries = visibility(user, self.sources);
        let token = auth::random_token();
        let newcomer = Newcomer {
            server_id: self.importing.server_id,
            user_id: &user.id,
            import_id: &self.importing.import.id,
            account: db::WaitingAccount {
                username: &username,
                email,
                libraries: &libraries,
            },
            invitation: self.owner.as_deref().map(|owner| Draft {
                token: &token,
                created_by: owner,
                expires_at: auth::invitation_expiry(None),
            }),
        };
        match db::imports::admit(pool, &newcomer)? {
            db::Awaited::Account(account) => Ok(Some(account.id)),
            db::Awaited::UsernameTaken | db::Awaited::EmailTaken => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests;
