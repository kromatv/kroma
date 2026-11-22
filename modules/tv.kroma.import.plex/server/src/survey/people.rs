use crate::account::{Friend, Me, Share};
use crate::wire::User;

const PIN: &str = "pin";

pub(crate) struct Listed<'a> {
    pub me: &'a Me,
    pub friends: &'a [Friend],
    pub shares: &'a [Share],
    pub machine: &'a str,
    pub unlocked: &'a [(String, String)],
}

/// One user of the survey, with the token that reads their watch state when
/// the importer may use one. It holds a token, so it has no `Debug`.
pub(crate) struct Person {
    pub user: User,
    pub token: Option<String>,
}

/// The users of one server: the owner, each person the server is shared with,
/// then each person plex.tv says it is shared with and lists no row for. A
/// Home user protected by a PIN is read with the token their PIN opened, and
/// with no other.
pub(crate) fn people(listed: &Listed<'_>) -> Vec<Person> {
    let friend = |id: &str| listed.friends.iter().find(|friend| friend.id == id);
    let opened = |id: &str| {
        let found = listed.unlocked.iter().find(|(user, _)| user == id);
        found.map(|(_, token)| token.clone())
    };
    let others = |id: &str| id != listed.me.id;
    let shared = listed
        .shares
        .iter()
        .filter(|share| others(&share.user_id))
        .map(|share| with_a_row(share, friend(&share.user_id), opened(&share.user_id)));
    let unlisted = listed
        .friends
        .iter()
        .filter(|friend| others(&friend.id))
        .filter(|friend| listed.shares.iter().all(|share| share.user_id != friend.id))
        .filter_map(|friend| without_a_row(friend, listed.machine, opened(&friend.id)));
    std::iter::once(owner(listed.me))
        .chain(shared)
        .chain(unlisted)
        .collect()
}

fn owner(me: &Me) -> Person {
    let user = User {
        id: me.id.clone(),
        name: me.name.clone(),
        email: me.email.clone(),
        signed_in: true,
        all_libraries: true,
        ..User::default()
    };
    Person { user, token: None }
}

fn with_a_row(share: &Share, friend: Option<&Friend>, opened: Option<String>) -> Person {
    let protected = friend.is_some_and(|friend| friend.protected);
    let token = if protected {
        opened
    } else {
        share.token.clone()
    };
    let name = friend
        .and_then(|friend| friend.title.clone())
        .or_else(|| share.username.clone())
        .or_else(|| share.email.clone())
        .unwrap_or_else(|| share.user_id.clone());
    let libraries = if share.all_libraries {
        Vec::new()
    } else {
        share.libraries.clone()
    };
    let user = User {
        id: share.user_id.clone(),
        name,
        email: share.email.clone().or_else(|| friend?.email.clone()),
        signed_in: false,
        all_libraries: share.all_libraries,
        libraries,
        finer_limits: friend.map(finer_limits).unwrap_or_default(),
        state_locked: token.is_none(),
        state_needs: (protected && token.is_none()).then_some(PIN),
    };
    Person { user, token }
}

fn without_a_row(friend: &Friend, machine: &str, opened: Option<String>) -> Option<Person> {
    let server = friend
        .servers
        .iter()
        .find(|server| server.machine == machine && !server.pending)?;
    let name = [&friend.title, &friend.username, &friend.email]
        .into_iter()
        .find_map(Clone::clone)
        .unwrap_or_else(|| friend.id.clone());
    let token = opened.filter(|_| friend.protected);
    let user = User {
        id: friend.id.clone(),
        name,
        email: friend.email.clone(),
        signed_in: false,
        all_libraries: server.all_libraries,
        libraries: Vec::new(),
        finer_limits: finer_limits(friend),
        state_locked: token.is_none(),
        state_needs: (friend.protected && token.is_none()).then_some(PIN),
    };
    Some(Person { user, token })
}

fn finer_limits(friend: &Friend) -> Vec<&'static str> {
    let mut limits = Vec::new();
    let keys = friend
        .filters
        .iter()
        .flat_map(|filter| filter.split('|'))
        .filter_map(|part| part.split('=').next());
    for key in keys {
        let limit = match key.trim_end_matches('!') {
            "contentRating" => "rating",
            "label" => "label",
            _ => "filter",
        };
        if !limits.contains(&limit) {
            limits.push(limit);
        }
    }
    limits
}

#[cfg(test)]
mod tests;
