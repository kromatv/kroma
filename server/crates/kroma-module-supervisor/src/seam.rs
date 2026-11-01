//! Which seam a module is reached over, and the address its process answers at.

use std::path::PathBuf;
use std::process::Command;

use anyhow::Context;
use kroma_module_manifest::Seam;

use super::Supervisor;

/// Where a running module's process answers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Endpoint {
    Unix(PathBuf),
    Tcp(u16),
}

impl Endpoint {
    /// `path`, with its query, on this module, as a URL [`kroma_http::Loopback`]
    /// reaches.
    pub fn url(&self, path: &str) -> String {
        match self {
            Self::Unix(socket) => format!("{}{path}", kroma_http::loopback::unix_url(socket)),
            Self::Tcp(port) => format!("http://127.0.0.1:{port}{path}"),
        }
    }

    pub fn seam(&self) -> Seam {
        match self {
            Self::Unix(_) => Seam::Unix,
            Self::Tcp(_) => Seam::Tcp,
        }
    }
}

pub(crate) fn effective(seam: Seam) -> Seam {
    if cfg!(unix) {
        seam
    } else {
        Seam::Tcp
    }
}

impl Supervisor {
    /// The seam `id` is reached over: the one its process was spawned on while
    /// it runs, else the one its installed bundle records, or `None` when it is
    /// not installed. A module on the legacy TCP seam is never given a sandbox:
    /// it cannot be reached once its network is gone.
    pub fn seam_of(&self, id: &str) -> Option<Seam> {
        if let Some(endpoint) = self.endpoint_of(id) {
            return Some(endpoint.seam());
        }
        self.installed_manifests()
            .into_iter()
            .find(|m| m.id == id)
            .map(|m| effective(m.seam))
    }

    /// Where the core serves its API for modules on the socket seam.
    pub fn host_socket(&self) -> PathBuf {
        self.run.host_socket()
    }

    /// [`host_socket`](Self::host_socket), ready to bind: its directory closed
    /// to every other user, and a socket a previous run left behind removed.
    pub fn prepare_host_socket(&self) -> std::io::Result<PathBuf> {
        self.run.prepare_host()
    }

    pub(crate) fn core_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.cfg.core_port)
    }

    pub(crate) fn assign_endpoint(&self, id: &str, seam: Seam) -> anyhow::Result<Endpoint> {
        Ok(match effective(seam) {
            Seam::Unix => Endpoint::Unix(
                self.run
                    .prepare_module(id)
                    .with_context(|| format!("prepare the socket '{id}' serves on"))?,
            ),
            Seam::Tcp => Endpoint::Tcp(free_port()?),
        })
    }

    pub(crate) fn point_at_core(&self, command: &mut Command, endpoint: &Endpoint) {
        command.env("KROMA_CORE_PORT", self.cfg.core_port.to_string());
        match endpoint {
            Endpoint::Unix(socket) => command.env("KROMA_MODULE_SOCKET", socket).env(
                "KROMA_CORE_URL",
                kroma_http::loopback::unix_url(&self.host_socket()),
            ),
            Endpoint::Tcp(port) => command
                .env("KROMA_MODULE_PORT", port.to_string())
                .env("KROMA_CORE_URL", self.core_url()),
        };
    }

    pub(crate) fn peer_base(&self, peer: &str, endpoint: &Endpoint, caller: Seam) -> String {
        match (endpoint, caller) {
            (Endpoint::Unix(_), Seam::Tcp) => format!("{}/api/module/{peer}", self.core_url()),
            _ => endpoint.url(""),
        }
    }
}

fn free_port() -> anyhow::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn an_endpoint_is_a_base_a_route_is_appended_to() {
        let socket = Endpoint::Unix(PathBuf::from("/data/run/modules/a.b/module.sock"));
        let port = Endpoint::Tcp(4100);

        assert_eq!(
            socket.url("/_port/x"),
            format!(
                "{}/_port/x",
                kroma_http::loopback::unix_url(Path::new("/data/run/modules/a.b/module.sock"))
            )
        );
        assert_eq!(port.url("/_port/x"), "http://127.0.0.1:4100/_port/x");
        assert_eq!((socket.seam(), port.seam()), (Seam::Unix, Seam::Tcp));
    }

    #[cfg(unix)]
    #[test]
    fn a_bundle_keeps_the_seam_it_recorded_where_sockets_exist() {
        assert_eq!(effective(Seam::Unix), Seam::Unix);
        assert_eq!(effective(Seam::Tcp), Seam::Tcp);
    }
}
