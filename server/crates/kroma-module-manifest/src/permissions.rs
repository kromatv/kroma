//! What a module may do, as it declares it: the network, the filesystem, the
//! binaries it starts, the core's media tools and the environment it reads. What is not declared is
//! denied. See `docs/module-security.md` for how each tier enforces it.

mod validation;

use serde::{Deserialize, Serialize};

use crate::matching::{host_matches, purpose_covers};

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
    pub media: Vec<MediaTool>,
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
/// `setting:<key>`; `count` makes it that port and the ones after it, for a
/// program that runs one listener per instance.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Listen {
    pub purpose: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub proto: Vec<Proto>,
    pub port: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<u16>,
}

/// The most ports one `net.listen` entry may hold.
pub const MAX_LISTEN_COUNT: u16 = 16;

impl Listen {
    /// The ports this entry holds. `setting` answers the port a
    /// `setting:<key>` names, `None` when nobody set it.
    pub fn ports(&self, setting: &dyn Fn(&str) -> Option<u16>) -> Vec<u16> {
        let first = match &self.port {
            serde_json::Value::Number(n) => n.as_u64().and_then(|p| u16::try_from(p).ok()),
            serde_json::Value::String(s) => s.strip_prefix("setting:").and_then(setting),
            _ => None,
        };
        let Some(first) = first.filter(|port| *port > 0) else {
            return Vec::new();
        };
        let count = self.count.unwrap_or(1).min(MAX_LISTEN_COUNT);
        (0..count).map_while(|step| first.checked_add(step)).collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Proto {
    Tcp,
    Udp,
}

/// What the host runs for a module with the core's own media tools, under the
/// core's ffmpeg budget, on files the module holds. `decode` turns an audio
/// track into raw PCM.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaTool {
    Decode,
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
    /// Whether some `net.connect` entry covers `attempt`, its purpose matched by
    /// [`purpose_covers`]. `setting` answers the hosts a `setting:<key>`
    /// destination currently names.
    pub fn allows_connect(
        &self,
        attempt: &Attempt<'_>,
        setting: &dyn Fn(&str) -> Vec<String>,
    ) -> bool {
        self.connect_reach(attempt, setting).is_some()
    }

    /// Whether some `net.connect` entry is for `purpose`, the first thing the host
    /// compares before it looks at where a call goes.
    pub fn declares_purpose(&self, purpose: &str) -> bool {
        self.net.connect.iter().any(|entry| entry.is_for(purpose))
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
            || self.media.iter().any(|tool| !before.media.contains(tool))
            || beyond(&self.env, &before.env)
    }

    fn covers(&self, asked: &Connect) -> bool {
        asked.to.iter().all(|to| {
            self.net.connect.iter().any(|granted| {
                purpose_covers(&granted.purpose, &asked.purpose)
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
            let applies = entry.is_for(attempt.purpose)
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
    fn is_for(&self, purpose: &str) -> bool {
        purpose_covers(&self.purpose, purpose)
    }

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

#[cfg(test)]
mod tests;
