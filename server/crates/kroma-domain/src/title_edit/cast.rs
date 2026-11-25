use serde::{Deserialize, Serialize};

use super::text::{cut, kept};
use super::{CAST_MAX, PERSON_MAX, ROLE_MAX};
use crate::metadata::CastMember;

/// One person in a title's cast, as a person or a `.nfo` file writes them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Actor {
    pub name: String,
    /// The part they play.
    #[serde(default)]
    pub role: Option<String>,
}

pub(super) fn listed(cast: Option<Vec<Actor>>) -> Option<Vec<Actor>> {
    let cast: Vec<Actor> = cast.into_iter().flatten().filter_map(tidied).collect();
    (!cast.is_empty()).then_some(cast)
}

fn tidied(actor: Actor) -> Option<Actor> {
    Some(Actor {
        name: kept(Some(actor.name))?,
        role: kept(actor.role),
    })
}

pub(super) fn clipped(cast: Option<Vec<Actor>>) -> Option<Vec<Actor>> {
    let cut_short = |actor: Actor| Actor {
        name: cut(actor.name, PERSON_MAX),
        role: actor.role.map(|role| cut(role, ROLE_MAX)),
    };
    cast.map(|cast| cast.into_iter().take(CAST_MAX).map(cut_short).collect())
}

pub(super) fn fits(cast: Option<&[Actor]>) -> bool {
    let short = |text: &str, max: usize| text.chars().count() <= max;
    let fits = |actor: &Actor| {
        short(&actor.name, PERSON_MAX) && actor.role.as_deref().is_none_or(|r| short(r, ROLE_MAX))
    };
    let cast = cast.unwrap_or_default();
    cast.len() <= CAST_MAX && cast.iter().all(fits)
}

pub(super) fn played_by(cast: &mut Vec<CastMember>, written: &[Actor]) {
    let provider = std::mem::take(cast);
    *cast = written
        .iter()
        .map(|actor| member(&provider, actor))
        .collect();
}

fn member(provider: &[CastMember], actor: &Actor) -> CastMember {
    let known = provider
        .iter()
        .find(|member| member.name.eq_ignore_ascii_case(&actor.name));
    let mut member = known.cloned().unwrap_or_else(|| CastMember {
        name: actor.name.clone(),
        tmdb_id: None,
        character: None,
        profile_url: None,
    });
    if actor.role.is_some() {
        member.character.clone_from(&actor.role);
    }
    member
}

#[cfg(test)]
mod tests;
