//! What a module may do, as it declares it: the network, the filesystem, the
//! binaries it starts and the environment it reads. What is not declared is
//! denied. See `docs/module-security.md` for the model and how each tier
//! enforces it.

use serde::{Deserialize, Serialize};

/// The `permissions` block of a manifest. Unknown keys are refused rather
/// than ignored: a misspelt permission is a module that silently gets nothing,
/// or a reviewer who reads a grant that is not there.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Permissions {
    #[serde(default)]
    pub net: NetPermissions,
    #[serde(default)]
    pub fs: FsPermissions,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub run: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub env: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NetPermissions {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub connect: Vec<Connect>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub listen: Vec<Listen>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub host: bool,
}

/// Connections for one purpose. `to` holds `public`, `lan`, a host (`*.` for a
/// domain and its subdomains) or `setting:<key>`, whose value is a URL or a
/// list of them the operator configured. No `ports` means any port; no `proto`
/// means TCP.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Connect {
    pub purpose: String,
    pub to: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ports: Vec<u16>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub proto: Vec<Proto>,
}

/// A socket the gateway listens on for the module. `port` is a number or
/// `setting:<key>`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Listen {
    pub purpose: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub proto: Vec<Proto>,
    pub port: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Proto {
    Tcp,
    Udp,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FsPermissions {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub read: Vec<FsRoot>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub write: Vec<FsRoot>,
}

/// The named places a module can be given, never a raw path.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FsRoot {
    Module,
    Media,
    Downloads,
    Temp,
}

/// One connection a module is about to open, as the policy sees it.
#[derive(Debug, Clone, Copy)]
pub struct Attempt<'a> {
    pub purpose: &'a str,
    pub host: &'a str,
    pub host_is_local: bool,
    pub port: u16,
    pub proto: Proto,
}

impl Permissions {
    /// Whether some `net.connect` entry covers `attempt`. `setting` answers the
    /// hosts a `setting:<key>` destination currently names.
    pub fn allows_connect(
        &self,
        attempt: &Attempt<'_>,
        setting: &dyn Fn(&str) -> Vec<String>,
    ) -> bool {
        self.net.connect.iter().any(|entry| {
            entry.purpose == attempt.purpose
                && (entry.ports.is_empty() || entry.ports.contains(&attempt.port))
                && entry.protocols().contains(&attempt.proto)
                && entry
                    .to
                    .iter()
                    .any(|to| destination_matches(to, attempt, setting))
        })
    }

    /// The first problem in the block, worded for a module author, or `None`.
    pub fn problem(&self) -> Option<String> {
        let net = &self.net;
        for entry in &net.connect {
            if !is_purpose(&entry.purpose) {
                return Some(format!(
                    "net.connect: \"{}\" is not a purpose name (a-z, 0-9, -)",
                    entry.purpose
                ));
            }
            if entry.to.is_empty() {
                return Some(format!(
                    "net.connect \"{}\": `to` names no destination",
                    entry.purpose
                ));
            }
            if let Some(bad) = entry.to.iter().find(|to| !is_destination(to)) {
                return Some(format!(
                    "net.connect \"{}\": \"{bad}\" is not a destination",
                    entry.purpose
                ));
            }
            if entry.ports.contains(&0) {
                return Some(format!(
                    "net.connect \"{}\": port 0 is not a port",
                    entry.purpose
                ));
            }
        }
        for entry in &net.listen {
            if !is_purpose(&entry.purpose) {
                return Some(format!(
                    "net.listen: \"{}\" is not a purpose name",
                    entry.purpose
                ));
            }
            let port_ok = match &entry.port {
                serde_json::Value::Number(n) => {
                    n.as_u64().is_some_and(|p| (1..=65535).contains(&p))
                }
                serde_json::Value::String(s) => {
                    s.strip_prefix("setting:").is_some_and(is_setting_key)
                }
                _ => false,
            };
            if !port_ok {
                return Some(format!(
                    "net.listen \"{}\": port must be 1-65535 or setting:<key>",
                    entry.purpose
                ));
            }
        }
        if let Some(bad) = self.run.iter().find(|bin| !is_binary_name(bin)) {
            return Some(format!(
                "run: \"{bad}\" must be a bare binary name, not a path"
            ));
        }
        if let Some(bad) = self.env.iter().find(|name| !is_env_name(name)) {
            return Some(format!(
                "env: \"{bad}\" is not an environment variable name"
            ));
        }
        None
    }
}

impl Connect {
    fn protocols(&self) -> &[Proto] {
        if self.proto.is_empty() {
            &[Proto::Tcp]
        } else {
            &self.proto
        }
    }
}

fn destination_matches(
    to: &str,
    attempt: &Attempt<'_>,
    setting: &dyn Fn(&str) -> Vec<String>,
) -> bool {
    match to {
        "public" => !attempt.host_is_local,
        "lan" => attempt.host_is_local,
        _ => match to.strip_prefix("setting:") {
            Some(key) => setting(key)
                .iter()
                .any(|host| host.eq_ignore_ascii_case(attempt.host)),
            None => host_matches(to, attempt.host),
        },
    }
}

fn host_matches(pattern: &str, host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    match pattern.strip_prefix("*.") {
        Some(domain) => host == domain || host.ends_with(&format!(".{domain}")),
        None => host == pattern,
    }
}

fn is_purpose(name: &str) -> bool {
    (1..=32).contains(&name.len())
        && name.starts_with(|c: char| c.is_ascii_lowercase())
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn is_destination(to: &str) -> bool {
    if to == "public" || to == "lan" {
        return true;
    }
    if let Some(key) = to.strip_prefix("setting:") {
        return is_setting_key(key);
    }
    let host = to.strip_prefix("*.").unwrap_or(to);
    !host.is_empty()
        && host.len() <= 253
        && host.contains('.')
        && host.split('.').all(|label| {
            !label.is_empty()
                && label
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        })
}

fn is_setting_key(key: &str) -> bool {
    !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
}

fn is_binary_name(bin: &str) -> bool {
    !bin.is_empty() && !bin.contains('/') && bin != "." && bin != ".."
}

fn is_env_name(name: &str) -> bool {
    !name.is_empty()
        && name.starts_with(|c: char| c.is_ascii_uppercase() || c == '_')
        && name
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}

#[cfg(test)]
mod tests;
