//! Whether a person a provider vouched for may come in, and as whom. The
//! provider says who they are; everything here is this server's decision.

use anyhow::Result;
use kroma_domain::LibraryScope;

use super::flows::Intent;
use super::person::Person;
use crate::db::{self, Applicant, Filed, NewMember, Pool, ProviderIdentity};
use crate::services::settings::{NewPeople, Provider};

pub const MAX_WAITING_REQUESTS: i64 = 20;
pub const REQUEST_TTL_SECS: i64 = 30 * 24 * 3600;

/// One person at one provider.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub issuer: String,
    pub person: Person,
}

impl Identity {
    fn stored<'a>(&'a self, label: &'a str) -> ProviderIdentity<'a> {
        ProviderIdentity {
            issuer: &self.issuer,
            subject: &self.person.subject,
            label,
        }
    }
}

/// Why a known-good identity is not an account yet. Each of these can still
/// end in one: the person signs in another way and claims the identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Waiting {
    /// A join request is with the admins. `filed` is false when it already was.
    Requested { filed: bool },
    /// An account already uses this email address.
    EmailTaken,
    /// This provider admits new people by invitation only.
    InvitationOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    /// Not in any of the groups the provider requires.
    Group,
    /// An admin declined this identity.
    Blocked,
    /// Too many join requests are waiting already.
    Full,
    /// The provider sent no email address to create an account with.
    NoEmail,
    InviteInvalid,
    /// The identity belongs to another account.
    LinkedElsewhere,
}

/// What an admin's test sign-in showed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestReport {
    pub person: Person,
    /// Whether this person would pass the provider's required groups.
    pub admitted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    SignedIn { user_id: String, created: bool },
    Waiting(Waiting, Identity),
    Refused(Refusal),
    /// The conversation with the provider broke down. Carries a code that
    /// names where, see [`super::identify::IdentifyError::code`].
    Failed(String),
    Linked,
    Tested(TestReport),
}

impl Outcome {
    /// Whether an account can still take this outcome's identity as its own.
    pub fn can_be_claimed(&self) -> bool {
        matches!(self, Outcome::Waiting(..))
    }
}

/// `suggested` when no account has it, else the first of `suggested2`,
/// `suggested3`, ... that none has.
pub fn free_username(pool: &Pool, suggested: &str) -> Result<String> {
    if !db::username_taken(pool, suggested, None)? {
        return Ok(suggested.to_string());
    }
    for n in 2.. {
        let candidate = format!("{suggested}{n}");
        if !db::username_taken(pool, &candidate, None)? {
            return Ok(candidate);
        }
    }
    unreachable!("an unbounded range always yields a free name")
}

fn create(
    pool: &Pool,
    identity: &Identity,
    email: &str,
    permissions: &[kroma_domain::Permission],
    libraries: &LibraryScope,
) -> Result<Outcome> {
    let username = free_username(pool, &identity.person.suggested_username())?;
    let label = identity.person.label();
    let created = db::create_member_with_identity(
        pool,
        &NewMember {
            email,
            username: &username,
            permissions,
            libraries,
        },
        &identity.stored(&label),
    )?;
    db::settle_join_request(pool, &identity.issuer, &identity.person.subject)?;
    Ok(match created {
        Some(user) => Outcome::SignedIn {
            user_id: user.id,
            created: true,
        },
        None => Outcome::Refused(Refusal::LinkedElsewhere),
    })
}

/// Gives `identity` to `user_id`. Linking the identity an account already
/// holds is not an error; one that belongs to somebody else is.
pub fn link(pool: &Pool, user_id: &str, identity: &Identity) -> Result<Outcome> {
    let label = identity.person.label();
    let linked = db::link_identity(pool, user_id, &identity.stored(&label))?;
    let ours = linked
        || db::identity_user(pool, &identity.issuer, &identity.person.subject)?
            .is_some_and(|owner| owner.id == user_id);
    if !ours {
        return Ok(Outcome::Refused(Refusal::LinkedElsewhere));
    }
    db::settle_join_request(pool, &identity.issuer, &identity.person.subject)?;
    Ok(Outcome::Linked)
}

fn sign_in(
    pool: &Pool,
    provider: &Provider,
    identity: Identity,
    invite: Option<&str>,
    now: i64,
) -> Result<Outcome> {
    let (issuer, subject) = (identity.issuer.as_str(), identity.person.subject.as_str());
    if let Some(user) = db::identity_user(pool, issuer, subject)? {
        return Ok(Outcome::SignedIn {
            user_id: user.id,
            created: false,
        });
    }
    if db::is_identity_blocked(pool, issuer, subject)? {
        return Ok(Outcome::Refused(Refusal::Blocked));
    }
    let Some(email) = identity.person.email.clone() else {
        return Ok(Outcome::Refused(Refusal::NoEmail));
    };
    if db::find_user_by_email(pool, &email)?.is_some() {
        return Ok(Outcome::Waiting(Waiting::EmailTaken, identity));
    }
    if let Some(invite) = invite {
        return match db::consume_invite(pool, invite)? {
            Some(permissions) => {
                create(pool, &identity, &email, &permissions, &LibraryScope::All)
            }
            None => Ok(Outcome::Refused(Refusal::InviteInvalid)),
        };
    }
    match provider.new_people {
        NewPeople::Create => create(
            pool,
            &identity,
            &email,
            &provider.permissions,
            &provider.libraries,
        ),
        NewPeople::Invite => Ok(Outcome::Waiting(Waiting::InvitationOnly, identity)),
        NewPeople::Ask => {
            let username = identity.person.suggested_username();
            let filed = db::file_join_request(
                pool,
                &Applicant {
                    issuer,
                    subject,
                    username: &username,
                    email: &email,
                    name: identity.person.name.as_deref(),
                },
                now,
                now - REQUEST_TTL_SECS,
                MAX_WAITING_REQUESTS,
            )?;
            Ok(match filed {
                Filed::New => Outcome::Waiting(Waiting::Requested { filed: true }, identity),
                Filed::AlreadyWaiting => {
                    Outcome::Waiting(Waiting::Requested { filed: false }, identity)
                }
                Filed::Blocked => Outcome::Refused(Refusal::Blocked),
                Filed::Full => Outcome::Refused(Refusal::Full),
            })
        }
    }
}

/// What an admin gives a person whose join request they approve.
pub struct Approval<'a> {
    pub username: Option<&'a str>,
    pub permissions: &'a [kroma_domain::Permission],
    pub libraries: &'a LibraryScope,
}

#[derive(Debug, Clone)]
pub enum Approved {
    Member(Box<kroma_domain::User>),
    /// No waiting request under that id.
    Gone,
    EmailTaken,
    UsernameTaken,
}

/// Turns a waiting join request into an account that signs in as the identity
/// that asked. A username the admin typed must be free; the provider's
/// suggestion gets the next free number.
pub fn approve(pool: &Pool, request_id: &str, approval: &Approval) -> Result<Approved> {
    let Some(request) = db::join_request(pool, request_id)?.filter(|r| !r.blocked) else {
        return Ok(Approved::Gone);
    };
    if db::find_user_by_email(pool, &request.email)?.is_some() {
        return Ok(Approved::EmailTaken);
    }
    let username = match approval.username.map(str::trim).filter(|name| !name.is_empty()) {
        Some(typed) if db::username_taken(pool, typed, None)? => {
            return Ok(Approved::UsernameTaken)
        }
        Some(typed) => typed.to_string(),
        None => free_username(pool, &request.username)?,
    };
    let created = db::create_member_with_identity(
        pool,
        &NewMember {
            email: &request.email,
            username: &username,
            permissions: approval.permissions,
            libraries: approval.libraries,
        },
        &ProviderIdentity {
            issuer: &request.issuer,
            subject: &request.subject,
            label: &request.email,
        },
    )?;
    db::delete_join_request(pool, &request.id)?;
    Ok(match created {
        Some(user) => Approved::Member(Box::new(user)),
        None => Approved::Gone,
    })
}

/// Decides what a verified identity gets. A test admits nobody and reports
/// what it saw; anything else passes the provider's required groups first.
pub fn admit(
    pool: &Pool,
    provider: &Provider,
    identity: Identity,
    intent: &Intent,
    now: i64,
) -> Result<Outcome> {
    let admitted = identity.person.is_in_one_of(&provider.required_groups);
    match intent {
        Intent::Test { .. } => Ok(Outcome::Tested(TestReport {
            person: identity.person,
            admitted,
        })),
        _ if !admitted => Ok(Outcome::Refused(Refusal::Group)),
        Intent::Link { user_id } => link(pool, user_id, &identity),
        Intent::SignIn { invite } => sign_in(pool, provider, identity, invite.as_deref(), now),
    }
}

#[cfg(test)]
mod tests;
