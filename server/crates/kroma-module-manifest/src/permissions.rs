//! What a module may do, as it declares it: the network, the filesystem, the
//! binaries it starts and the environment it reads. What is not declared is
//! denied. See `docs/module-security.md` for how each tier enforces it.

mod validation;

use serde::{Deserialize, Serialize};

/// The `permissions` block of a manifest. Unknown keys are refused, not
/// ignored: a misspelt permission would silently grant nothing.
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub discovery: Vec<Discovery>,
}

/// What a module may ask of the local network through the host, without a socket
/// of its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Discovery {
    /// Publish a service over mDNS.
    Mdns,
    /// Search for devices over SSDP.
    Ssdp,
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

#[derive(Debug, Clone, Copy)]
pub struct Attempt<'a> {
    pub purpose: &'a str,
    pub host: &'a str,
    pub host_is_local: bool,
    pub port: u16,
    pub proto: Proto,
}

/// How far a covered connection may reach once its name is resolved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reach {
    /// Covered by `public` alone, so every address the name resolves to must be
    /// public.
    PublicOnly,
    /// Covered by `lan`, a host or a setting: a destination someone named, which
    /// may well sit on a private address.
    Named,
}

impl Permissions {
    /// Whether some `net.connect` entry covers `attempt`. `setting` answers the
    /// hosts a `setting:<key>` destination currently names.
    pub fn allows_connect(
        &self,
        attempt: &Attempt<'_>,
        setting: &dyn Fn(&str) -> Vec<String>,
    ) -> bool {
        self.connect_reach(attempt, setting).is_some()
    }

    /// Whether this block asks for anything `before` does not grant.
    pub fn widens(&self, before: &Permissions) -> bool {
        let beyond = |asked: &[String], granted: &[String]| asked.iter().any(|a| !granted.contains(a));
        let roots_beyond = |asked: &[FsRoot], granted: &[FsRoot]| asked.iter().any(|a| !granted.contains(a));
        (self.net.host && !before.net.host)
            || self.net.connect.iter().any(|connect| !before.covers(connect))
            || self.net.discovery.iter().any(|kind| !before.net.discovery.contains(kind))
            || self.net.listen.iter().any(|listen| !before.net.listen.contains(listen))
            || roots_beyond(&self.fs.read, &before.fs.read)
            || roots_beyond(&self.fs.write, &before.fs.write)
            || beyond(&self.run, &before.run)
            || beyond(&self.env, &before.env)
    }

    fn covers(&self, asked: &Connect) -> bool {
        asked.to.iter().all(|to| {
            self.net.connect.iter().any(|granted| {
                granted.purpose == asked.purpose
                    && granted.to.contains(to)
                    && (granted.ports.is_empty()
                        || (!asked.ports.is_empty()
                            && asked.ports.iter().all(|port| granted.ports.contains(port))))
                    && asked
                        .protocols()
                        .iter()
                        .all(|proto| granted.protocols().contains(proto))
            })
        })
    }

    /// How far `attempt` may reach, or `None` when no `net.connect` entry covers
    /// it.
    pub fn connect_reach(
        &self,
        attempt: &Attempt<'_>,
        setting: &dyn Fn(&str) -> Vec<String>,
    ) -> Option<Reach> {
        let mut covered = None;
        for entry in &self.net.connect {
            let applies = entry.purpose == attempt.purpose
                && (entry.ports.is_empty() || entry.ports.contains(&attempt.port))
                && entry.protocols().contains(&attempt.proto);
            if !applies {
                continue;
            }
            for to in &entry.to {
                if destination_matches(to, attempt, setting) {
                    if to != "public" {
                        return Some(Reach::Named);
                    }
                    covered = Some(Reach::PublicOnly);
                }
            }
        }
        covered
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

#[cfg(test)]
mod tests;
