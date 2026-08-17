//! In-memory ring of recent client crash reports, backing the opt-in crash
//! reporting endpoint and its admin read path. Process-global and bounded: it
//! evicts the oldest report at capacity and refuses more than `RATE_MAX` reports
//! per fixed window, so an unauthenticated public endpoint cannot grow it or
//! spin the CPU without bound.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};

use kroma_domain::{CrashRecord, CrashReportBody};

const CAPACITY: usize = 200;
const MAX_MESSAGE: usize = 2_000;
const MAX_STACK: usize = 16_000;
const MAX_FIELD: usize = 256;
const RATE_WINDOW_MS: i64 = 60_000;
const RATE_MAX: usize = 30;

pub static CRASH_BUFFER: LazyLock<CrashBuffer> = LazyLock::new(CrashBuffer::new);

pub struct CrashBuffer {
    inner: Mutex<Ring>,
    next: AtomicU64,
}

struct Ring {
    records: VecDeque<CrashRecord>,
    window_start: i64,
    window_count: usize,
}

impl CrashBuffer {
    fn new() -> Self {
        Self {
            inner: Mutex::new(Ring {
                records: VecDeque::with_capacity(CAPACITY),
                window_start: i64::MIN,
                window_count: 0,
            }),
            next: AtomicU64::new(1),
        }
    }

    /// Store a report stamped with the current time, or `None` when the window's
    /// rate cap is already reached.
    pub fn record(&self, body: CrashReportBody) -> Option<CrashRecord> {
        self.record_at(body, now_ms())
    }

    fn record_at(&self, body: CrashReportBody, now: i64) -> Option<CrashRecord> {
        let mut ring = self.inner.lock().unwrap();
        if now.saturating_sub(ring.window_start) >= RATE_WINDOW_MS {
            ring.window_start = now;
            ring.window_count = 0;
        }
        if ring.window_count >= RATE_MAX {
            return None;
        }
        ring.window_count += 1;
        let record = clamp(body, self.next.fetch_add(1, Ordering::Relaxed), now);
        if ring.records.len() == CAPACITY {
            ring.records.pop_front();
        }
        ring.records.push_back(record.clone());
        Some(record)
    }

    /// Newest-first snapshot of at most `limit` reports.
    pub fn snapshot(&self, limit: usize) -> Vec<CrashRecord> {
        let ring = self.inner.lock().unwrap();
        ring.records.iter().rev().take(limit).cloned().collect()
    }
}

fn clamp(body: CrashReportBody, seq: u64, received_at: i64) -> CrashRecord {
    let mut build = body.build;
    build.version = cap(build.version, MAX_FIELD);
    build.commit = build.commit.map(|c| cap(c, MAX_FIELD));
    let device = body.device.map(|d| kroma_domain::CrashDevice {
        model: cap(d.model, MAX_FIELD),
        os: cap(d.os, MAX_FIELD),
    });
    CrashRecord {
        seq,
        received_at,
        message: cap(body.message.trim().to_string(), MAX_MESSAGE),
        stack: cap(body.stack, MAX_STACK),
        platform: cap(body.platform, MAX_FIELD),
        captured_at: body.captured_at,
        build,
        device,
    }
}

fn cap(value: String, max: usize) -> String {
    value.chars().take(max).collect()
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_domain::CrashBuild;

    fn body(message: &str) -> CrashReportBody {
        CrashReportBody {
            message: message.to_string(),
            stack: "at foo\nat bar".to_string(),
            platform: "Android TV".to_string(),
            captured_at: 1_700_000_000_000,
            build: CrashBuild {
                version: "1.2.3".to_string(),
                commit: Some("abc123".to_string()),
            },
            device: Some(kroma_domain::CrashDevice {
                model: "BRAVIA 4K".to_string(),
                os: "Android TV 14".to_string(),
            }),
        }
    }

    #[test]
    fn stores_and_snapshots_newest_first() {
        let buf = CrashBuffer::new();
        buf.record_at(body("first"), 0);
        buf.record_at(body("second"), 1);
        let got = buf.snapshot(10);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].message, "second");
        assert_eq!(got[1].message, "first");
        assert_eq!(got[0].received_at, 1);
        assert!(got[1].seq < got[0].seq);
    }

    #[test]
    fn clamps_every_string_and_trims_the_message() {
        let buf = CrashBuffer::new();
        let mut b = body("  spaced  ");
        b.stack = "x".repeat(MAX_STACK + 500);
        b.platform = "p".repeat(MAX_FIELD + 10);
        b.build.version = "v".repeat(MAX_FIELD + 10);
        buf.record_at(b, 0);
        let record = &buf.snapshot(1)[0];
        assert_eq!(record.message, "spaced");
        assert_eq!(record.stack.chars().count(), MAX_STACK);
        assert_eq!(record.platform.chars().count(), MAX_FIELD);
        assert_eq!(record.build.version.chars().count(), MAX_FIELD);
    }

    #[test]
    fn capacity_evicts_oldest() {
        let buf = CrashBuffer::new();
        for i in 0..(CAPACITY + 10) {
            buf.record_at(body(&format!("crash {i}")), i as i64 * RATE_WINDOW_MS);
        }
        let got = buf.snapshot(usize::MAX);
        assert_eq!(got.len(), CAPACITY);
        assert_eq!(got[0].message, format!("crash {}", CAPACITY + 9));
        assert_eq!(got[CAPACITY - 1].message, "crash 10");
    }

    #[test]
    fn rate_cap_rejects_within_a_window_then_recovers() {
        let buf = CrashBuffer::new();
        for _ in 0..RATE_MAX {
            assert!(buf.record_at(body("x"), 1_000).is_some());
        }
        assert!(buf.record_at(body("over"), 1_500).is_none());
        assert!(buf
            .record_at(body("next window"), 1_000 + RATE_WINDOW_MS)
            .is_some());
    }

    #[test]
    fn a_missing_device_is_kept_absent() {
        let buf = CrashBuffer::new();
        let mut b = body("no device");
        b.device = None;
        b.build.commit = None;
        buf.record_at(b, 0);
        let record = &buf.snapshot(1)[0];
        assert!(record.device.is_none());
        assert!(record.build.commit.is_none());
    }

    #[test]
    fn snapshot_limit_caps_the_returned_count() {
        let buf = CrashBuffer::new();
        for i in 0..5 {
            buf.record_at(body(&format!("c{i}")), 0);
        }
        assert_eq!(buf.snapshot(2).len(), 2);
    }
}
