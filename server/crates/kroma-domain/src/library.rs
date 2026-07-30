//! Library types: a scanned library root and its derived classification.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LibraryKind {
    Movies,
    Shows,
    Mixed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Library {
    pub id: String,
    pub name: String,
    pub kind: LibraryKind,
    pub path: String,
    #[serde(rename = "itemCount")]
    pub item_count: usize,
}
