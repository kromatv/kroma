//! Where a running module answers, and where the core answers it back.

use std::path::PathBuf;

use anyhow::Context;

use super::Supervisor;

/// Where a running module answers: the Unix socket in its run directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoint {
    pub socket: PathBuf,
}

impl Endpoint {
    /// `path`, with its query, on this module, as a URL [`kroma_http::Loopback`]
    /// reaches.
    pub fn url(&self, path: &str) -> String {
        format!("{}{path}", kroma_http::loopback::unix_url(&self.socket))
    }
}

impl Supervisor {
    /// Where the core serves its API for modules.
    pub fn host_socket(&self) -> PathBuf {
        self.run.host_socket()
    }

    /// [`host_socket`](Self::host_socket), ready to bind: its directory closed
    /// to every other user, and a socket a previous run left behind removed.
    pub fn prepare_host_socket(&self) -> std::io::Result<PathBuf> {
        self.run.prepare_host()
    }

    pub(crate) fn assign_endpoint(&self, id: &str) -> anyhow::Result<Endpoint> {
        let socket = self
            .run
            .prepare_module(id)
            .with_context(|| format!("prepare the socket '{id}' serves on"))?;
        Ok(Endpoint { socket })
    }

    pub(crate) fn peer_base(&self, peer: &str, endpoint: &Endpoint, via_core: bool) -> String {
        if via_core {
            let core = kroma_http::loopback::unix_url(&self.host_socket());
            return format!("{core}/api/module/{peer}");
        }
        endpoint.url("")
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn an_endpoint_is_a_base_a_route_is_appended_to() {
        let endpoint = Endpoint {
            socket: PathBuf::from("/data/run/modules/a.b/module.sock"),
        };

        let url = endpoint.url("/_port/x");

        assert_eq!(
            url,
            format!(
                "{}/_port/x",
                kroma_http::loopback::unix_url(Path::new("/data/run/modules/a.b/module.sock"))
            )
        );
    }
}
