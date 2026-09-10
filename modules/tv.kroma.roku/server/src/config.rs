//! What the console tells this sidecar and nothing else needs: the developer
//! password every box on the network was set up with, kept in the module's
//! own directory and readable by its owner alone.

use std::path::Path;

use serde::{Deserialize, Serialize};

const FILE: &str = "config.json";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub dev_password: String,
}

pub fn read(dir: &Path) -> Config {
    std::fs::read(dir.join(FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub fn write(dir: &Path, config: &Config) -> anyhow::Result<()> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join(FILE);
    std::fs::write(&path, serde_json::to_vec_pretty(config)?)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {

    use crate::state::Roku;

    #[test]
    fn the_password_survives_a_restart_and_a_blank_one_forgets_it() {
        let scratch = kroma_module_sdk::testing::temp_dir("roku-pw");
        let dir = scratch.path().to_path_buf();
        let roku = Roku::new(dir.clone());
        assert_eq!(roku.password(), "");

        roku.set_password("  hunter2 ").unwrap();
        assert_eq!(Roku::new(dir.clone()).password(), "hunter2");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.join("config.json"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }

        roku.set_password("").unwrap();
        assert_eq!(roku.password(), "");
    }

    #[test]
    fn a_missing_or_broken_file_reads_as_no_password() {
        let scratch = kroma_module_sdk::testing::temp_dir("roku-cfg");
        let dir = scratch.path().join("absent");
        assert_eq!(super::read(&dir).dev_password, "");

        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(super::FILE), b"{not json").unwrap();
        assert_eq!(super::read(&dir), super::Config::default());
    }
}
