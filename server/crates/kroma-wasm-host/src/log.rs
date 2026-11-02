use std::pin::Pin;
use std::sync::{Arc, Mutex, PoisonError};
use std::task::{Context, Poll};

use tokio::io::AsyncWrite;
use wasmtime_wasi::cli::{IsTerminal, StdoutStream};

/// Hears each line a component writes to its stdout or stderr.
pub type LogSink = Arc<dyn Fn(&str) + Send + Sync>;

#[derive(Clone)]
pub(crate) struct LineStream {
    sink: LogSink,
    pending: Arc<Mutex<Vec<u8>>>,
}

impl LineStream {
    pub(crate) fn new(sink: LogSink) -> Self {
        Self {
            sink,
            pending: Arc::default(),
        }
    }
}

impl IsTerminal for LineStream {
    fn is_terminal(&self) -> bool {
        false
    }
}

impl StdoutStream for LineStream {
    fn async_stream(&self) -> Box<dyn AsyncWrite + Send + Sync> {
        Box::new(self.clone())
    }
}

impl AsyncWrite for LineStream {
    fn poll_write(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        written: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        let mut pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
        pending.extend_from_slice(written);
        while let Some(end) = pending.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = pending.drain(..=end).collect();
            (self.sink)(String::from_utf8_lossy(&line).trim_end());
        }
        Poll::Ready(Ok(written.len()))
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Poll::Ready(Ok(()))
    }
}
