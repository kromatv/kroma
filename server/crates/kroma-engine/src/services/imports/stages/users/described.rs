//! What a new account takes from the other server's description of its user:
//! a name, an address and the libraries it may see. The description is the
//! importer's word, so each is bounded here.

use std::collections::{HashMap, HashSet};

use crate::model::LibraryScope;
use crate::model::import::User;

const MAX_NAME_CHARS: usize = 40;
const MAX_ADDRESS_CHARS: usize = 254;
const NAMELESS: &str = "member";

fn label(text: &str) -> Option<String> {
    let visible: String = text.chars().filter(|c| !c.is_control()).collect();
    let before_the_at_sign = visible
        .split('@')
        .map(str::trim)
        .find(|part| !part.is_empty())?;
    Some(kroma_primitives::clean_label(
        before_the_at_sign,
        MAX_NAME_CHARS,
    ))
}

pub(super) fn address_of(user: &User) -> Option<String> {
    let address = user.email.as_deref()?.trim().to_lowercase();
    let plausible = address.contains('@')
        && address.chars().count() <= MAX_ADDRESS_CHARS
        && !address.chars().any(|c| c.is_whitespace() || c.is_control());
    plausible.then_some(address)
}

pub(super) fn shared_addresses<'a>(users: impl Iterator<Item = &'a User>) -> HashSet<String> {
    let mut carried = HashSet::new();
    users
        .filter_map(address_of)
        .filter(|address| !carried.insert(address.clone()))
        .collect()
}

pub(super) fn name_of(user: &User) -> String {
    label(&user.name)
        .or_else(|| label(&address_of(user)?))
        .unwrap_or_else(|| NAMELESS.to_string())
}

pub(super) fn visibility(user: &User, sources: &HashMap<String, String>) -> LibraryScope {
    if !user.finer_limits.is_empty() {
        return LibraryScope::Only(Vec::new());
    }
    if user.all_libraries {
        return LibraryScope::All;
    }
    let mut seen: Vec<String> = Vec::new();
    for source in user.libraries.iter().filter_map(|id| sources.get(id)) {
        if !seen.contains(source) {
            seen.push(source.clone());
        }
    }
    LibraryScope::Only(seen)
}
