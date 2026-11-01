use std::future::Future;
use std::path::PathBuf;

pub(crate) enum Listen {
    Unix(PathBuf),
    Tcp(u16),
}

pub(crate) enum Listener {
    #[cfg(unix)]
    Unix(tokio::net::UnixListener),
    Tcp(tokio::net::TcpListener),
}

impl Listen {
    pub(crate) fn from_process() -> anyhow::Result<Self> {
        if let Some(socket) = std::env::var_os("KROMA_MODULE_SOCKET") {
            return Ok(Self::Unix(PathBuf::from(socket)));
        }
        let port = std::env::var("KROMA_MODULE_PORT").map_err(|_| {
            anyhow::anyhow!("neither KROMA_MODULE_SOCKET nor KROMA_MODULE_PORT set")
        })?;
        Ok(Self::Tcp(port.parse()?))
    }

    pub(crate) async fn bind(&self) -> anyhow::Result<Listener> {
        match self {
            Self::Unix(socket) => bind_unix(socket),
            Self::Tcp(port) => {
                let addr = std::net::SocketAddr::from(([127, 0, 0, 1], *port));
                Ok(Listener::Tcp(tokio::net::TcpListener::bind(addr).await?))
            }
        }
    }
}

impl std::fmt::Display for Listen {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unix(socket) => write!(f, "unix:{}", socket.display()),
            Self::Tcp(port) => write!(f, "127.0.0.1:{port}"),
        }
    }
}

#[cfg(unix)]
fn bind_unix(socket: &std::path::Path) -> anyhow::Result<Listener> {
    let listener = tokio::net::UnixListener::bind(socket)
        .map_err(|e| anyhow::anyhow!("bind {}: {e}", socket.display()))?;
    Ok(Listener::Unix(listener))
}

#[cfg(not(unix))]
fn bind_unix(socket: &std::path::Path) -> anyhow::Result<Listener> {
    anyhow::bail!(
        "this platform has no Unix sockets, so {} cannot be served",
        socket.display()
    )
}

impl Listener {
    pub(crate) async fn serve(
        self,
        app: axum::Router,
        stop: impl Future<Output = ()> + Send + 'static,
    ) -> std::io::Result<()> {
        match self {
            #[cfg(unix)]
            Self::Unix(listener) => {
                axum::serve(listener, app)
                    .with_graceful_shutdown(stop)
                    .await
            }
            Self::Tcp(listener) => {
                axum::serve(listener, app)
                    .with_graceful_shutdown(stop)
                    .await
            }
        }
    }
}
