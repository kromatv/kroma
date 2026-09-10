//! The developer installer every Roku in developer mode serves on port 80:
//! digest-authenticated as `rokudev`, one channel at a time, replaced in place.

use std::path::Path;

use anyhow::Result;

use crate::address::DeviceAddress;
use crate::curl::CurlConfig;

const INSTALLER_PORT: u16 = 80;
const USER: &str = "rokudev";
const TIMEOUT_SECS: u32 = 90;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Installed,
    Unchanged,
    WrongPassword,
    Refused(String),
}

pub fn install(address: DeviceAddress, password: &str, zip: &Path) -> Result<Outcome> {
    let base = address.url(INSTALLER_PORT);
    let reply = CurlConfig::new(&format!("{base}/plugin_install"), TIMEOUT_SECS)
        .digest(USER, password)
        .form("mysubmit", "Replace")
        .form("archive", &format!("@{}", zip.display()))
        .run()?;
    Ok(read_outcome(reply.status, &reply.body))
}

pub fn read_outcome(status: u16, body: &str) -> Outcome {
    if status == 401 {
        return Outcome::WrongPassword;
    }
    if body.contains("Install Success") || body.contains("Replace Success") {
        return Outcome::Installed;
    }
    if body.contains("Identical to previous version") {
        return Outcome::Unchanged;
    }
    Outcome::Refused(reason(status, body))
}

fn reason(status: u16, body: &str) -> String {
    let hint = body
        .lines()
        .map(str::trim)
        .find(|l| l.contains("Failure") || l.contains("Error") || l.contains("error"))
        .map(strip_tags)
        .unwrap_or_default();
    if hint.is_empty() {
        format!("installer answered {status}")
    } else {
        hint
    }
}

fn strip_tags(line: &str) -> String {
    let mut out = String::new();
    let mut inside = false;
    for c in line.chars() {
        match c {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => out.push(c),
            _ => {}
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fresh_install_and_a_replace_both_count_as_installed() {
        assert_eq!(
            read_outcome(200, "<p>Install Success.</p>"),
            Outcome::Installed
        );
        assert_eq!(
            read_outcome(200, "<p>Replace Success.</p>"),
            Outcome::Installed
        );
    }

    #[test]
    fn a_box_already_running_this_build_is_unchanged_rather_than_failed() {
        let body = "<font color=\"red\">Identical to previous version -- not replacing.</font>";

        assert_eq!(read_outcome(200, body), Outcome::Unchanged);
    }

    #[test]
    fn a_digest_challenge_that_never_clears_means_the_password_is_wrong() {
        assert_eq!(read_outcome(401, ""), Outcome::WrongPassword);
    }

    #[test]
    fn a_refusal_carries_the_installers_own_words_without_the_markup() {
        let body = "<html><body><div id=\"msg\"><font color=\"red\">Install Failure: Invalid archive</font></div></body></html>";

        assert_eq!(
            read_outcome(200, body),
            Outcome::Refused("Install Failure: Invalid archive".into())
        );
    }

    #[test]
    fn a_refusal_with_no_words_names_the_status() {
        assert_eq!(
            read_outcome(500, "<html/>"),
            Outcome::Refused("installer answered 500".into())
        );
    }
}
