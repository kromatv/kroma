use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const FILE: &str = "mullvad.json";

/// What this server holds of a Mullvad account: the device it registered and
/// the place it connects to. Kept beside the bridge's files, readable by the
/// server's user alone, and never sent to a browser.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Account {
    pub number: String,
    pub device_id: String,
    pub device_name: String,
    pub private_key: String,
    pub ipv4: String,
    pub place: Option<Place>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Place {
    pub country: String,
    pub country_name: String,
    pub city: Option<String>,
    pub city_name: Option<String>,
    pub hostname: String,
}

fn path(dir: &Path) -> PathBuf {
    dir.join(FILE)
}

pub(crate) fn load(dir: &Path) -> Option<Account> {
    serde_json::from_slice(&std::fs::read(path(dir)).ok()?).ok()
}

pub(crate) fn save(dir: &Path, account: &Account) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let text = serde_json::to_string(account).map_err(std::io::Error::other)?;
    crate::bridge::write_private(&path(dir), &text)
}

pub(crate) fn forget(dir: &Path) {
    let _ = std::fs::remove_file(path(dir));
}
