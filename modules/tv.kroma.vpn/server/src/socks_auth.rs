//! The credentials the bridge's SOCKS5 port asks for, so only a consumer this
//! module handed its URL to can send traffic through the tunnel.

use std::io::Write;
use std::path::Path;

pub(crate) const USER: &str = "kroma";

const FILE: &str = "socks.secret";

pub(crate) fn password(vpn_dir: &Path) -> std::io::Result<String> {
    let path = vpn_dir.join(FILE);
    if let Some(kept) = read(&path) {
        return Ok(kept);
    }
    std::fs::create_dir_all(vpn_dir)?;
    let minted = kroma_module_sdk::primitives::random_token();
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    match options.open(&path) {
        Ok(mut file) => {
            file.write_all(minted.as_bytes())?;
            Ok(minted)
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => match read(&path) {
            Some(kept) => Ok(kept),
            None => {
                std::fs::write(&path, &minted)?;
                Ok(minted)
            }
        },
        Err(e) => Err(e),
    }
}

fn read(path: &Path) -> Option<String> {
    let kept = std::fs::read_to_string(path).ok()?;
    let kept = kept.trim();
    (!kept.is_empty()).then(|| kept.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_password_is_minted_once_and_then_kept() {
        let dir = kroma_module_sdk::testing::temp_dir("socks-auth");

        let first = password(dir.path()).unwrap();
        let again = password(dir.path()).unwrap();

        assert_eq!(first.len(), 64);
        assert_eq!(first, again);
    }

    #[test]
    fn an_empty_secret_file_is_replaced_rather_than_used() {
        let dir = kroma_module_sdk::testing::temp_dir("socks-auth-empty");
        std::fs::write(dir.path().join(FILE), "").unwrap();

        let password = password(dir.path()).unwrap();

        assert_eq!(password.len(), 64);
    }

    #[cfg(unix)]
    #[test]
    fn only_this_user_can_read_the_secret() {
        use std::os::unix::fs::PermissionsExt;
        let dir = kroma_module_sdk::testing::temp_dir("socks-auth-mode");

        password(dir.path()).unwrap();

        let mode = std::fs::metadata(dir.path().join(FILE))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }
}
