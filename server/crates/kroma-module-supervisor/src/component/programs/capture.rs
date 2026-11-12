use std::collections::VecDeque;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

const OUTPUT_CEILING: usize = 16 * 1024 * 1024;
const DRAIN_GRACE: Duration = Duration::from_millis(500);
const DRAIN_STEP: Duration = Duration::from_millis(2);

/// What a program wrote to one stream, kept up to a ceiling, oldest bytes first
/// to go.
#[derive(Default)]
pub(super) struct Captured {
    bytes: Mutex<VecDeque<u8>>,
    closed: AtomicBool,
}

impl Captured {
    pub(super) fn take(&self, max_bytes: usize) -> Vec<u8> {
        let mut held = self.bytes.lock().unwrap_or_else(PoisonError::into_inner);
        let taken = held.len().min(max_bytes);
        held.drain(..taken).collect()
    }

    fn is_closed(&self) -> bool {
        self.closed.load(Ordering::Acquire)
    }
}

pub(super) fn capture(mut from: impl Read + Send + 'static) -> Arc<Captured> {
    let captured = Arc::new(Captured::default());
    let filling = Arc::clone(&captured);
    std::thread::spawn(move || {
        let mut chunk = [0_u8; 8192];
        while let Ok(read) = from.read(&mut chunk) {
            if read == 0 {
                break;
            }
            let mut held = filling.bytes.lock().unwrap_or_else(PoisonError::into_inner);
            held.extend(&chunk[..read]);
            let over = held.len().saturating_sub(OUTPUT_CEILING);
            held.drain(..over);
        }
        filling.closed.store(true, Ordering::Release);
    });
    captured
}

// A program that has exited may still have bytes in its pipes. They are read
// before its exit is reported, unless something it left behind holds the pipe.
pub(super) fn drained(streams: &[&Captured]) {
    let deadline = Instant::now() + DRAIN_GRACE;
    while Instant::now() < deadline && !streams.iter().all(|stream| stream.is_closed()) {
        std::thread::sleep(DRAIN_STEP);
    }
}
