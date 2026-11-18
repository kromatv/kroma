use serde::{Deserialize, Serialize};

/// What one server holds, read before anything is imported: its libraries, its
/// users, how much there is, and the keys of what an import leaves behind.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Survey {
    pub libraries: Vec<Library>,
    pub users: Vec<User>,
    pub counts: Counts,
    pub left_behind: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub kind: LibraryKind,
    #[serde(default)]
    pub folders: Vec<String>,
}

/// What a library of the other server holds. `Other` is every kind this server
/// does not play, and every kind this build does not know.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LibraryKind {
    Movies,
    Shows,
    Mixed,
    #[default]
    #[serde(other)]
    Other,
}

/// One user of the other server. A user with neither `all_libraries` nor a
/// library sees none, and `state_needs` is read only for a locked state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(default)]
    pub signed_in: bool,
    #[serde(default)]
    pub all_libraries: bool,
    #[serde(default)]
    pub libraries: Vec<String>,
    #[serde(default)]
    pub finer_limits: Vec<String>,
    #[serde(default)]
    pub state_locked: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state_needs: Option<String>,
}

/// How much the other server holds. An absent count was not counted, which is
/// not zero.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Counts {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub titles: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub states: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plays: Option<u64>,
}
