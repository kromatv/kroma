use crate::xml::Element;

/// One person of `/api/users`: a friend of the account, or a member of its
/// Home.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct Friend {
    pub id: String,
    pub title: Option<String>,
    pub username: Option<String>,
    pub email: Option<String>,
    pub protected: bool,
    pub filters: Vec<String>,
    pub servers: Vec<FriendServer>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FriendServer {
    pub machine: String,
    pub all_libraries: bool,
    pub pending: bool,
}

/// One row of a server's `shared_servers`: a person's token for the server
/// and the libraries they may open. It holds a token, so it has no `Debug`.
pub(crate) struct Share {
    pub user_id: String,
    pub token: Option<String>,
    pub username: Option<String>,
    pub email: Option<String>,
    pub all_libraries: bool,
    pub libraries: Vec<String>,
}

const FILTERS: [&str; 3] = ["filterAll", "filterMovies", "filterTelevision"];

pub(super) fn friends(listed: &Element) -> Vec<Friend> {
    listed
        .every("User")
        .into_iter()
        .filter_map(friend)
        .collect()
}

fn friend(user: &Element) -> Option<Friend> {
    Some(Friend {
        id: user.text("id")?,
        title: user.text("title"),
        username: user.text("username"),
        email: user.text("email"),
        protected: user.flag("protected"),
        filters: FILTERS.iter().filter_map(|name| user.text(name)).collect(),
        servers: user.named("Server").filter_map(friend_server).collect(),
    })
}

fn friend_server(server: &Element) -> Option<FriendServer> {
    Some(FriendServer {
        machine: server.text("machineIdentifier")?,
        all_libraries: server.flag("allLibraries"),
        pending: server.flag("pending"),
    })
}

pub(super) fn shares(listed: &Element) -> Vec<Share> {
    listed
        .every("SharedServer")
        .into_iter()
        .filter_map(share)
        .collect()
}

fn share(row: &Element) -> Option<Share> {
    let libraries = row
        .named("Section")
        .filter(|section| section.flag("shared"))
        .filter_map(|section| section.text("key"))
        .collect();
    Some(Share {
        user_id: row.text("userID")?,
        token: row.text("accessToken"),
        username: row.text("username"),
        email: row.text("email"),
        all_libraries: row.flag("allLibraries"),
        libraries,
    })
}
