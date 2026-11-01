//! The core's own Unix socket, where a module on the socket seam calls back.
//! Bound once for the life of the process; a router is served on it for as long
//! as the guard [`SeamSocket::serve`] hands back is held.

use kroma_module_supervisor::Supervisor;

pub struct SeamSocket {
    #[cfg(unix)]
    bound: Option<(std::os::unix::net::UnixListener, std::path::PathBuf)>,
}

/// Serving the socket; dropping it stops.
pub struct Served(tokio::task::JoinHandle<()>);

impl Drop for Served {
    fn drop(&mut self) {
        self.0.abort();
    }
}

impl SeamSocket {
    /// A socket that cannot be bound is logged rather than fatal: the server
    /// still serves its clients, and the modules on the socket seam fail their
    /// callbacks loudly.
    #[cfg(unix)]
    pub fn bind(supervisor: &Supervisor) -> Self {
        let bound = (|| -> anyhow::Result<_> {
            let socket = supervisor.prepare_host_socket()?;
            let listener = std::os::unix::net::UnixListener::bind(&socket)?;
            listener.set_nonblocking(true)?;
            Ok((listener, socket))
        })();
        match bound {
            Ok((listener, socket)) => {
                tracing::info!("modules call back on {}", socket.display());
                Self {
                    bound: Some((listener, socket)),
                }
            }
            Err(e) => {
                tracing::error!("modules on the socket seam cannot call back: {e:#}");
                Self { bound: None }
            }
        }
    }

    #[cfg(not(unix))]
    pub fn bind(_supervisor: &Supervisor) -> Self {
        Self {}
    }

    #[cfg(unix)]
    pub fn serve(&self, app: axum::Router) -> Option<Served> {
        let (listener, _) = self.bound.as_ref()?;
        let listener = tokio::net::UnixListener::from_std(listener.try_clone().ok()?).ok()?;
        Some(Served(tokio::spawn(async move {
            if let Err(e) = axum::serve(listener, app).await {
                tracing::error!("the module socket stopped serving: {e}");
            }
        })))
    }

    #[cfg(not(unix))]
    pub fn serve(&self, _app: axum::Router) -> Option<Served> {
        None
    }
}

#[cfg(unix)]
impl Drop for SeamSocket {
    fn drop(&mut self) {
        if let Some((_, socket)) = &self.bound {
            let _ = std::fs::remove_file(socket);
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_socket_that_cannot_be_bound_leaves_nothing_to_serve() {
        let t = crate::api::test_support::test_app();
        let taken = t.supervisor.host_socket();
        std::fs::create_dir_all(taken.join("not-a-socket")).unwrap();

        let socket = SeamSocket::bind(&t.supervisor);
        let served = socket.serve(axum::Router::new());

        assert!(served.is_none());
        assert!(taken.is_dir(), "nothing was bound over it");
        std::fs::remove_dir_all(&taken).unwrap();
        let _ = std::fs::remove_dir(taken.parent().unwrap());
    }
}
